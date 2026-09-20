"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rate-limit";
import { ROLE_HOME, type AppRole } from "@/lib/roles";

export type AuthResult = { error?: string };

export async function loginAction(
  _prev: AuthResult | null,
  formData: FormData
): Promise<AuthResult> {
  const raw = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!raw || !password) return { error: "Username/email dan password wajib diisi." };

  // Rate limit per IP + per identitas: mencegat brute-force sebelum menyentuh
  // Supabase Auth (lapisan ekstra; limit bawaan Supabase tetap berlaku).
  const ip = await clientIpFromHeaders();
  const byIp = consumeRateLimit(`login:ip:${ip}`, 10, 5 * 60_000);
  if (!byIp.ok) {
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${byIp.retryAfterSeconds} detik.` };
  }
  const byId = consumeRateLimit(`login:id:${raw}`, 8, 5 * 60_000);
  if (!byId.ok) {
    return { error: `Terlalu banyak percobaan untuk akun ini. Coba lagi dalam ${byId.retryAfterSeconds} detik.` };
  }

  const supabase = await createClient();

  // V12.1 — login bisa memakai EMAIL atau USERNAME akun santri.
  // Username di-resolve ke email sintetis akun santri via RPC SECURITY
  // DEFINER `resolve_login_email` — profiles dilindungi RLS sehingga TIDAK
  // bisa dibaca langsung oleh pengunjung yang belum login (lookup anon
  // selalu kosong). Email pribadi pengguna tidak pernah bocor.
  let email = raw;
  if (!raw.includes("@")) {
    // Username hasil generator otomatis bisa pendek (mis. "ali"), jadi batas
    // bawah 1 karakter; pengecekan sebenarnya dilakukan RPC di bawah.
    if (!/^[a-z0-9._-]{1,30}$/.test(raw)) {
      return { error: "Username/email atau password salah." };
    }
    const { data: authUser, error: rpcErr } = await supabase.rpc("resolve_login_email", {
      p_username: raw,
    });
    if (rpcErr || !authUser) return { error: "Username/email atau password salah." };
    email = authUser as string;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Pesan generik: jangan bocorkan apakah akun ada.
    return { error: "Username/email atau password salah." };
  }

  // "Ingat saya": keep Supabase's persistent refresh session (checked).
  // Unchecked: strip expiry from the auth cookie chunks so they become
  // session-scoped and are cleared when the browser closes. Password
  // plaintext is never stored — tokens are managed entirely by Supabase Auth.
  if (!remember) {
    const jar = await cookies();
    for (const cookie of jar.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        jar.set(cookie.name, cookie.value, { path: "/", httpOnly: true, secure: true, sameSite: "lax" });
      }
    }
  }

  // Role is resolved ONLY from the profiles table (server-side source of truth).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Profil tidak ditemukan. Hubungi pengelola lembaga." };
  }

  redirect(ROLE_HOME[profile.role as AppRole] ?? "/masuk");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/masuk");
}
