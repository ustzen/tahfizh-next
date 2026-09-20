"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V12 — keamanan akun (ganti password sendiri).
 *
 * V12: tidak ada lagi akun Wali Santri — hanya ada Admin, Koordinator, Guru,
 * dan Santri. Sistem pembuatan akun wali (username otomatis + password
 * sementara) sudah dihapus. Action ini dipakai kartu "Ganti Password Sementara"
 * untuk akun apa pun yang ditandai must_change_password oleh admin lembaga.
 */

export type AkunResult = { error?: string; success?: string; data?: { username?: string; password?: string } };

/** Akun: ganti password (login pertama — WAJIB bila must_change_password). */
export async function changeOwnPasswordAction(
  _prev: AkunResult | null,
  formData: FormData
): Promise<AkunResult> {
  const sessionProfile = await getSessionProfile();
  if (!sessionProfile) return { error: "Sesi berakhir. Silakan login kembali." };

  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Password baru minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };
  if (password === current) return { error: "Password baru harus berbeda dari password lama." };

  const supabase = await createClient();

  // Verifikasi password lama dulu (re-auth) agar sesi curi tidak bisa ganti.
  const email = sessionProfile.email;
  if (email) {
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signInErr) return { error: "Password saat ini salah." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Gagal menyimpan password. Coba lagi." };

  // Reset penanda wajib-ganti setelah password baru tersimpan.
  await supabase.from("profiles").update({ must_change_password: false }).eq("id", sessionProfile.id);

  // V12.11: kartu kini dirender DashboardShell (semua role) — revalidasi
  // segmen role agar kartu langsung hilang tanpa login ulang.
  revalidatePath(`/${sessionProfile.role.toLowerCase()}`, "layout");
  return { success: "Password berhasil diperbarui." };
}

/**
 * V12.5 — RESET SANDI dari form Edit (menu Data Guru / Data Santri).
 *
 * Tombol "Reset Sandi" di bagian bawah form Edit Guru / Edit Santri memanggil
 * action ini dengan (kind, personId, password). Verifikasi target dilakukan
 * RPC SECURITY DEFINER `admin_force_reset_password_by_person` (session ADMIN,
 * satu tenant, hanya WALI_SANTRI/USTADZ) yang mengembalikan email akun dari
 * auth.users — plaintext password TIDAK PERNAH masuk SQL; perubahan password
 * tetap via service-role Supabase Auth.
 */
export async function adminResetPasswordByPersonAction(
  _prev: AkunResult | null,
  formData: FormData
): Promise<AkunResult> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mereset password." };
  }

  const kind = String(formData.get("kind") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (kind !== "teacher" && kind !== "student") return { error: "Jenis akun tidak dikenal." };
  if (!personId) return { error: "Data akun tidak ditemukan." };
  if (newPassword.length < 8) return { error: "Password baru minimal 8 karakter." };
  if (newPassword !== confirm) return { error: "Konfirmasi password tidak cocok." };

  const supabase = await createClient();
  const { data: email, error: rpcErr } = await supabase.rpc(
    "admin_force_reset_password_by_person",
    { p_kind: kind, p_person_id: personId }
  );
  if (rpcErr || !email) {
    const msg = rpcErr?.message ?? "";
    if (msg.includes("AKUN_TIDAK_DITEMUKAN")) return { error: "Akun ini belum memiliki login. Reset sandi hanya untuk akun yang sudah dibuatkan username." };
    return { error: "Reset tidak diizinkan. Pastikan Anda login sebagai Admin lembaga." };
  }

  // RPC sudah memverifikasi tenant+role; personId → profil akun via snapshot
  // username di students/teachers (dibaca via client, RLS tetap berlaku).
  const table = kind === "teacher" ? "teachers" : "students";
  const { data: person, error: pErr } = await supabase
    .from(table)
    .select("id, full_name, login_username")
    .eq("id", personId)
    .maybeSingle();
  if (pErr || !person?.login_username) {
    return { error: "Akun ini belum memiliki login. Reset sandi hanya untuk akun yang sudah dibuatkan username." };
  }

  const { data: profile, error: profErr0 } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("username", person.login_username)
    .maybeSingle();
  if (profErr0 || !profile) return { error: "Profil akun tidak ditemukan." };

  const fullName = profile.full_name ?? "akun";

  const admin = createAdminClient();
  const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, {
    password: newPassword,
  });
  if (updErr) {
    console.error("[adminResetPasswordByPersonAction] updateUserById failed:", updErr.message);
    return { error: "Gagal mereset password. Coba lagi." };
  }

  const { error: profErr } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profile.id);
  if (profErr) {
    console.error("[adminResetPasswordByPersonAction] set must_change_password failed:", profErr.message);
    return { success: `Password ${fullName} direset, namun penanda wajib-ganti gagal disimpan.` };
  }

  return {
    success: `Password ${fullName} berhasil direset. Akun wajib mengganti password pada login berikutnya.`,
  };
}

/**
 * V12.4 — RESET PAKSA PASSWORD oleh ADMIN lembaga.
 *
 * Admin dapat mengganti password akun SANTRI, GURU (ustadz), dan KOORDINATOR
 * di lembaganya (mis. lupa password / insiden keamanan). Keamanan:
 *   - Session ADMIN diverifikasi dari cookie (bukan dari client).
 *   - Target WAJIB satu tenant dengan admin (multi-tenant tetap terisolasi).
 *   - Role yang bisa ditarget: WALI_SANTRI / USTADZ / KOORDINATOR saja —
 *     ADMIN lain dan DEVELOPER TIDAK bisa direset dari sini (mencegah admin
 *     saling menjatuhkan / menyentuh akun platform).
 *   - Password baru di-hash Supabase Auth via service-role updateUserById;
 *     tidak pernah disimpan plaintext.
 *   - must_change_password diaktifkan: pemilik akun wajib mengganti password
 *     pada login berikutnya (kartu force-change-password yang sudah ada).
 */
export async function adminForceResetPasswordAction(
  _prev: AkunResult | null,
  formData: FormData
): Promise<AkunResult> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mereset password." };
  }

  const targetId = String(formData.get("profileId") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!targetId) return { error: "Pilih akun terlebih dahulu." };
  if (newPassword.length < 8) return { error: "Password baru minimal 8 karakter." };
  if (newPassword !== confirm) return { error: "Konfirmasi password tidak cocok." };
  if (targetId === session.id) {
    return { error: "Gunakan form Ganti Password di atas untuk mengubah password sendiri." };
  }

  const supabase = await createClient();
  // Target dibaca via client (RLS profiles_select_tenant) sehingga ID milik
  // tenant lain otomatis tidak terlihat; verifikasi eksplisit tetap dilakukan.
  const { data: target, error: tErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, tenant_id")
    .eq("id", targetId)
    .maybeSingle();
  if (tErr || !target) return { error: "Akun tidak ditemukan." };
  if (target.tenant_id !== session.tenantId) return { error: "Akun tidak ditemukan." };
  if (!["WALI_SANTRI", "USTADZ", "KOORDINATOR"].includes(target.role)) {
    return { error: "Hanya akun Santri, Guru, atau Koordinator yang dapat direset." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, {
    password: newPassword,
  });
  if (updErr) {
    console.error("[adminForceResetPasswordAction] updateUserById failed:", updErr.message);
    return { error: "Gagal mereset password. Coba lagi." };
  }

  // Wajib ganti password saat login berikutnya.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", targetId);
  if (profErr) {
    console.error("[adminForceResetPasswordAction] set must_change_password failed:", profErr.message);
    return { success: "Password direset, namun penanda wajib-ganti gagal disimpan." };
  }

  return {
    success: `Password ${target.full_name} berhasil direset. Akun wajib mengganti password pada login berikutnya.`,
  };
}
