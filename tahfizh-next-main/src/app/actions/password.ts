"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rate-limit";

export type PasswordResult = { error?: string; success?: string };

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Sends the Supabase recovery email; Supabase handles the actual reset. */
export async function requestPasswordResetAction(
  _prev: PasswordResult | null,
  formData: FormData
): Promise<PasswordResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // PKCE callback exchanges the code, then forwards to /reset-password.
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });

  // Always report success: never leak whether an email is registered.
  if (error) return { error: "Gagal mengirim email. Coba lagi." };
  return { success: "Jika email terdaftar, link reset password telah dikirim." };
}

/**
 * V12.12 — Pemulihan akun login-username (Santri/Guru, email sintetis).
 *
 * Alur tanpa email: pemohon mengajukan via USERNAME → Admin lembaga menyetujui
 * di Pengaturan → Keamanan dan menerima kode sekali-pakai (8 karakter, 30 menit)
 * untuk dikirim ke pemohon via WhatsApp → pemohon menukar kode + password baru
 * di halaman Lupa Password.
 *
 * RPC SECURITY DEFINER yang memvalidasi kode mengembalikan profile_id dan
 * menandai kode USED; penetapan password tetap via Supabase Auth service-role
 * sehingga plaintext password tidak pernah menyentuh SQL.
 */
export async function requestAccountResetAction(
  _prev: PasswordResult | null,
  formData: FormData
): Promise<PasswordResult> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Masukkan username akun Anda." };
  if (username.includes("@")) {
    return { error: "Gunakan kolom Email di atas jika Anda login dengan email." };
  }

  const supabase = await createClient();
  // Anti-spam: maksimal 5 pengajuan per IP per jam (di luar batas 3/24 jam
  // per akun yang sudah dijaga RPC).
  const ip = await clientIpFromHeaders();
  const limited = consumeRateLimit(`pwreset:${ip}`, 5, 60 * 60_000);
  if (!limited.ok) {
    return { error: `Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(limited.retryAfterSeconds / 60)} menit.` };
  }
  const { data, error } = await supabase.rpc("password_reset_request", { p_username: username });
  if (error) return { error: "Gagal mengirim permintaan. Coba lagi." };
  return { success: String(data ?? "") };
}

/** V12.12 — tukar kode sekali-pakai + password baru (dipanggil sebelum updateUser). */
export async function completeAccountResetAction(
  _prev: PasswordResult | null,
  formData: FormData
): Promise<PasswordResult> {
  const username = String(formData.get("username") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!username || !code) return { error: "Username dan kode reset wajib diisi." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };

  const supabase = await createClient();
  const { data: profileId, error: rpcErr } = await supabase.rpc("password_reset_code_check", {
    p_username: username,
    p_code: code,
  });
  if (rpcErr || !profileId) {
    return { error: "Kode reset tidak valid atau sudah kedaluwarsa. Minta kode baru ke Admin lembaga." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin.auth.admin.updateUserById(String(profileId), {
    password,
  });
  if (updErr) {
    console.error("[completeAccountResetAction] updateUserById failed:", updErr.message);
    return { error: "Gagal menyimpan password. Kode masih berlaku — coba lagi." };
  }

  return { success: "Password berhasil diperbarui. Silakan login dengan password baru Anda." };
}

/** V12.12 — daftar permintaan reset untuk Admin lembaga. */
export type AdminResetRequest = {
  id: string;
  full_name: string;
  role: "WALI_SANTRI" | "USTADZ" | "KOORDINATOR" | "ADMIN" | "DEVELOPER";
  username: string | null;
  whatsapp: string | null;
  requested_at: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED" | "EXPIRED";
};

export async function listPasswordResetRequests(): Promise<AdminResetRequest[]> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_password_reset_requests");
  if (error) return [];
  return (data ?? []) as AdminResetRequest[];
}

export type DecideResult = { error?: string; success?: string; code?: string };

/** V12.12 — Admin setujui (dapat kode sekali-pakai) / tolak permintaan reset. */
export async function decidePasswordResetAction(
  _prev: DecideResult | null,
  formData: FormData
): Promise<DecideResult> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat memproses permintaan reset." };
  }

  const requestId = String(formData.get("requestId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!requestId || !/[a-zA-Z0-9-]/.test(requestId)) return { error: "Permintaan tidak dikenal." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_password_reset_decide", {
    p_request_id: requestId,
    p_approve: decision === "approve",
  });
  if (error) {
    const msg = error.message;
    if (msg.includes("PERMINTAAN_SUDAH_DIPROSES")) return { error: "Permintaan ini sudah diproses." };
    return { error: "Gagal memproses permintaan. Coba lagi." };
  }

  if (decision !== "approve") return { success: "Permintaan ditolak." };
  return {
    success: "Permintaan disetujui. Bagikan kode berikut ke pemohon via WhatsApp — berlaku 30 menit dan hanya bisa dipakai sekali.",
    code: String(data ?? ""),
  };
}

/** Called from /reset-password (user arrives with a recovery link session). */
export async function updatePasswordAction(
  _prev: PasswordResult | null,
  formData: FormData
): Promise<PasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Gagal menyimpan password. Link mungkin sudah kedaluwarsa." };

  return { success: "Password berhasil diperbarui." };
}
