"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rate-limit";
import type { TenantKind } from "@/lib/roles";
import { seedDemoData } from "@/lib/demo-seed";

export type RegisterResult = { error?: string; success?: string };

const VALID_KINDS: TenantKind[] = [
  "SEKOLAH",
  "TPQ",
  "RUMAH_TAHFIZH",
  "MADRASAH",
  "LEMBAGA_ALQURAN",
  "LAINNYA",
];

/**
 * Lembaga registration — GRATIS, no payment module in V1.
 * Runs server-side with a service-role client; the browser only ever sends
 * form fields, never role/tenant.
 *
 * Steps: create auth user -> create tenant (trigger assigns T-10x) ->
 * create profile with role ADMIN (pendaftar otomatis ADMIN) -> auto sign-in.
 */
export async function registerLembagaAction(
  _prev: RegisterResult | null,
  formData: FormData
): Promise<RegisterResult> {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  // ---- server-side validation (never trust the client) ----
  if (name.length < 3 || name.length > 120) return { error: "Nama lembaga harus 3-120 karakter." };
  if (!VALID_KINDS.includes(kind as TenantKind)) return { error: "Jenis lembaga tidak valid." };
  if (fullName.length < 2 || fullName.length > 120)
    return { error: "Nama penanggung jawab harus 2-120 karakter." };
  if (whatsapp && !/^\+?[0-9]{8,15}$/.test(whatsapp)) return { error: "Nomor WhatsApp tidak valid." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };

  // Anti-spam pendaftaran: maksimal 3 lembaga per IP per jam.
  const ip = await clientIpFromHeaders();
  const limited = consumeRateLimit(`signup:${ip}`, 3, 60 * 60_000);
  if (!limited.ok) {
    return { error: `Terlalu banyak pendaftaran. Coba lagi dalam ${Math.ceil(limited.retryAfterSeconds / 60)} menit.` };
  }

  const admin = createAdminClient();
  const userClient = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 1. Auth user — signUp (bukan admin.createUser) sehingga Supabase Auth
  //    mengirim email verifikasi (#2). Redirect mengarah ke /verifikasi-email.
  const { data: signUpData, error: signUpErr } = await userClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, tenant_kind: kind },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/verifikasi-email`,
    },
  });
  if (signUpErr) {
    console.error("[registerLembagaAction] signUp failed:", signUpErr.message, signUpErr);
    const msg =
      signUpErr.message === "User already registered"
        ? "Email sudah terdaftar."
        : "Pendaftaran gagal. Coba lagi.";
    return { error: msg };
  }
  const userId = signUpData.user?.id;
  if (!userId) return { error: "Pendaftaran gagal. Coba lagi." };

  // 2-3 tenant + profil; on failure roll the auth user back so IDs are not burned.
  const result = await (async (): Promise<{ ok: true; home: string } | { ok: false; error: string }> => {
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({ name, kind, status: "ACTIVE" })
      .select("id, business_code")
      .single();
    if (tenantErr) {
      console.error("[registerLembagaAction] tenant insert failed:", tenantErr.message, tenantErr);
      return { ok: false, error: "Pendaftaran gagal (tenant). Coba lagi." };
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: userId,
      full_name: fullName,
      role: "ADMIN",
      tenant_id: tenant.id,
      whatsapp: whatsapp || null,
    });
    if (profileErr) {
      console.error("[registerLembagaAction] profile insert failed:", profileErr.message, profileErr);
      return { ok: false, error: "Pendaftaran gagal (profil). Coba lagi." };
    }

    // V12.3 — data + akun DEMO otomatis: 3 guru, 3 santri, 2 halaqah, 1 infak
    // lunas, semua dengan akun login (username = nama panggilan, password =
    // panggilan+1234, wajib ganti saat login pertama). Idempoten; kegagalan
    // seed TIDAK menggagalkan pendaftaran — hanya dicatat di log server.
    try {
      const demo = await seedDemoData({ tenantId: tenant.id, adminProfileId: userId, adminName: fullName });
      if (!demo.ok) {
        console.error("[registerLembagaAction] demo seed warnings:", demo.errors.join("; "));
      }
    } catch (e) {
      console.error("[registerLembagaAction] demo seed failed:", e instanceof Error ? e.message : e);
    }

    // Auto sign-in only works when the project has email confirmation
    // disabled. "Email not confirmed" is the EXPECTED state of the verification
    // flow (#2) — not a failure; tenant + profile stand and the user verifies.
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
    if (signInErr && !/not confirmed|not_confirmed/i.test(signInErr.message)) {
      console.error("[registerLembagaAction] auto sign-in failed:", signInErr.message, signInErr);
      return { ok: false, error: "Akun dibuat, namun gagal masuk otomatis. Silakan login." };
    }

    const mustVerify = signInErr != null; // sign-in failed only because email is unconfirmed
    return { ok: true, home: mustVerify ? "/verifikasi-email" : "/admin" };
  })();

  if (!result.ok) {
    await admin.auth.admin.deleteUser(userId);
    return { error: result.error };
  }

  // When "Confirm email" is enabled signUp returns NO session and Supabase has
  // just sent the verification email — tell the user (#2), do not enter yet.
  if (!signUpData.session) {
    return { success: "Silakan periksa email Anda untuk melakukan verifikasi." };
  }

  redirect(result.home);
}
