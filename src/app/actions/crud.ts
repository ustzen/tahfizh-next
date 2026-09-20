"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { allocateAccount, createLoginAccount } from "@/lib/account";

export type ActionResult = { error?: string; success?: string };

function revalidateTenantPaths(role: AppRole, tenantCode: string | null, extra: string[] = []) {
  const section = role.toLowerCase();
  revalidatePath(`/${section}`);
  // V12: menu Pengguna dihapus — Data Guru & Data Santri jadi tempat pengelolaan.
  revalidatePath(`/${section}/guru`);
  revalidatePath(`/${section}/santri`);
  // V12: menu Data Guru & Data Santri terpisah (admin + koordinator).
  revalidatePath("/admin/guru");
  revalidatePath("/admin/santri");
  revalidatePath("/koordinator/guru");
  revalidatePath("/koordinator/santri");
  revalidatePath(`/${section}/santri`);
  revalidatePath(`/${section}/anak`);
  for (const p of extra) revalidatePath(p);
}

// ============================================================================
// ADMIN & KOORDINATOR — Guru & Santri (V12: menu Pengguna dihapus)
// ============================================================================

/** V12: guru/santri dikelola ADMIN & KOORDINATOR (RLS V1 sudah mengizinkan keduanya). */
const MANAGER_ROLES = ["ADMIN", "KOORDINATOR"] as const;

function isManager(role: string): role is (typeof MANAGER_ROLES)[number] {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}

export async function createTeacherAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };
  if (!profile.tenantId) return { error: "Lembaga tidak ditemukan." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();

  if (fullName.length < 2 || fullName.length > 120) return { error: "Nama guru harus 2-120 karakter." };
  if (gender !== "L" && gender !== "P") return { error: "Gender wajib dipilih." };
  if (whatsapp && !/^\+?[0-9]{8,15}$/.test(whatsapp)) return { error: "Nomor WhatsApp tidak valid." };

  const nickname = String(formData.get("nickname") ?? "").trim();
  // Akun login guru (opsional) — V12.2: dibiarkan kosong = otomatis dari nama
  // panggilan (username panggilan [unik global], password panggilan+1234).
  const loginUsername = String(formData.get("loginUsername") ?? "").trim().toLowerCase();
  const loginPassword = String(formData.get("loginPassword") ?? "");

  if (nickname.length > 60) return { error: "Nama panggilan maksimal 60 karakter." };
  if (loginUsername && !/^[a-z0-9._-]{4,30}$/.test(loginUsername)) {
    return { error: "Username 4-30 karakter: huruf kecil, angka, titik, garis bawah, atau strip." };
  }
  if (loginPassword && loginPassword.length < 8) return { error: "Password akun minimal 8 karakter." };
  if (loginUsername && !loginPassword) return { error: "Password wajib diisi bila username diisi." };

  const client = await createClient();
  const { data: teacher, error } = await client
    .from("teachers")
    .insert({
      tenant_id: profile.tenantId,
      full_name: fullName,
      gender,
      nickname: nickname || null,
      whatsapp: whatsapp || null,
    })
    .select("id")
    .single();
  if (error || !teacher) return { error: "Gagal menambah guru." };

  // V12.2 — akun login guru: username+password diisi = pakai nilai itu;
  // keduanya kosong = otomatis dari nama panggilan (lihat lib/account.ts).
  if (loginUsername && loginPassword) {
    const accErr = await createLoginAccount({
      tenantId: profile.tenantId,
      personId: teacher.id,
      fullName,
      kind: "teacher",
      username: loginUsername,
      password: loginPassword,
      nickname: nickname || null,
    });
    if (accErr) {
      return { success: `Guru ${fullName} ditambahkan. CATATAN: akun login gagal dibuat — ${accErr}` };
    }
  } else if (!loginUsername && !loginPassword) {
    const creds = await allocateAccount(fullName, nickname);
    const accErr = await createLoginAccount({
      tenantId: profile.tenantId,
      personId: teacher.id,
      fullName,
      kind: "teacher",
      username: creds.username,
      password: creds.password,
      nickname: creds.nickname,
    });
    if (accErr) {
      return { success: `Guru ${fullName} ditambahkan. CATATAN: akun login gagal dibuat — ${accErr}` };
    }
    revalidateTenantPaths(profile.role, profile.tenantCode);
    return { success: `Guru ${fullName} berhasil ditambahkan. Akun login: ${creds.username} / ${creds.password} (wajib ganti password saat login pertama).` };
  }

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: `Guru ${fullName} berhasil ditambahkan.` };
}

export async function updateTeacherAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!id || fullName.length < 2 || fullName.length > 120) return { error: "Nama guru harus 2-120 karakter." };
  if (gender !== "L" && gender !== "P") return { error: "Gender wajib dipilih." };
  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Status tidak valid." };

  const client = await createClient();
  const { error } = await client
    .from("teachers")
    .update({ full_name: fullName, gender, whatsapp: whatsapp || null, status })
    .eq("id", id);

  if (error) return { error: "Gagal memperbarui guru." };

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: "Guru berhasil diperbarui." };
}

export async function deleteTeacherAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Guru tidak valid." };

  const client = await createClient();
  const { error } = await client.from("teachers").delete().eq("id", id);
  if (error) return { error: "Gagal menghapus guru." };

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: "Guru berhasil dihapus." };
}

export async function createStudentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };
  if (!profile.tenantId) return { error: "Lembaga tidak ditemukan." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const nis = String(formData.get("nis") ?? "").trim();
  const nisn = String(formData.get("nisn") ?? "").replace(/\D/g, "");
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianWhatsapp = String(formData.get("guardianWhatsapp") ?? "").replace(/\s+/g, "");
  // Akun login santri (opsional) — V12.1
  const loginUsername = String(formData.get("loginUsername") ?? "").trim().toLowerCase();
  const loginPassword = String(formData.get("loginPassword") ?? "");

  if (fullName.length < 2 || fullName.length > 120) return { error: "Nama santri harus 2-120 karakter." };
  if (gender !== "L" && gender !== "P") return { error: "Gender wajib dipilih." };
  if (nickname.length > 60) return { error: "Nama panggilan maksimal 60 karakter." };
  if (nis.length > 30) return { error: "NIS maksimal 30 karakter." };
  if (nisn && !/^[0-9]{10}$/.test(nisn)) return { error: "NISN harus 10 digit angka." };
  if (guardianName.length > 120) return { error: "Nama wali maksimal 120 karakter." };
  if (guardianWhatsapp && !/^\+?[0-9]{8,15}$/.test(guardianWhatsapp)) {
    return { error: "Nomor WhatsApp wali tidak valid." };
  }
  if (loginUsername && !/^[a-z0-9._-]{4,30}$/.test(loginUsername)) {
    return { error: "Username 4-30 karakter: huruf kecil, angka, titik, garis bawah, atau strip." };
  }
  if (loginPassword && loginPassword.length < 8) return { error: "Password akun minimal 8 karakter." };
  if (loginUsername && !loginPassword) return { error: "Password wajib diisi bila username diisi." };

  const client = await createClient();
  const { data: student, error } = await client
    .from("students")
    .insert({
      tenant_id: profile.tenantId,
      full_name: fullName,
      gender,
      nickname: nickname || null,
      nis: nis || null,
      nisn: nisn || null,
      guardian_name: guardianName || null,
      guardian_whatsapp: guardianWhatsapp || null,
    })
    .select("id")
    .single();
  if (error || !student) {
    if (error?.message.includes("students_tenant_nis_key")) return { error: `NIS "${nis}" sudah dipakai santri lain.` };
    if (error?.message.includes("students_tenant_nisn_key")) return { error: `NISN "${nisn}" sudah dipakai santri lain.` };
    return { error: "Gagal menambah santri." };
  }

  // V12.2 — akun login santri: username+password diisi = pakai nilai itu;
  // keduanya kosong = OTOMATIS dari nama panggilan — username = panggilan
  // (unik global: zain → zain2 bila sudah dipakai), password = panggilan+1234.
  // Dibuat via service-role SETELAH verifikasi role; password di-hash Supabase
  // Auth (tidak pernah disimpan plaintext).
  if (loginUsername && loginPassword) {
    const accErr = await createLoginAccount({
      tenantId: profile.tenantId,
      personId: student.id,
      fullName,
      kind: "student",
      username: loginUsername,
      password: loginPassword,
      nickname: nickname || null,
    });
    if (accErr) {
      return { success: `Santri ${fullName} ditambahkan. CATATAN: akun login gagal dibuat — ${accErr}` };
    }
  } else if (!loginUsername && !loginPassword) {
    const creds = await allocateAccount(fullName, nickname);
    const accErr = await createLoginAccount({
      tenantId: profile.tenantId,
      personId: student.id,
      fullName,
      kind: "student",
      username: creds.username,
      password: creds.password,
      nickname: creds.nickname,
    });
    if (accErr) {
      return { success: `Santri ${fullName} ditambahkan. CATATAN: akun login gagal dibuat — ${accErr}` };
    }
    revalidateTenantPaths(profile.role, profile.tenantCode);
    return { success: `Santri ${fullName} berhasil ditambahkan. Akun login: ${creds.username} / ${creds.password} (wajib ganti password saat login pertama).` };
  }

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: `Santri ${fullName} berhasil ditambahkan.` };
}

export async function updateStudentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const nis = String(formData.get("nis") ?? "").trim();
  const nisn = String(formData.get("nisn") ?? "").replace(/\D/g, "");
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianWhatsapp = String(formData.get("guardianWhatsapp") ?? "").replace(/\s+/g, "");

  if (!id || fullName.length < 2 || fullName.length > 120) return { error: "Nama santri harus 2-120 karakter." };
  if (gender !== "L" && gender !== "P") return { error: "Gender wajib dipilih." };
  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Status tidak valid." };
  if (nickname.length > 60) return { error: "Nama panggilan maksimal 60 karakter." };
  if (nis.length > 30) return { error: "NIS maksimal 30 karakter." };
  if (nisn && !/^[0-9]{10}$/.test(nisn)) return { error: "NISN harus 10 digit angka." };
  if (guardianName.length > 120) return { error: "Nama wali maksimal 120 karakter." };
  if (guardianWhatsapp && !/^\+?[0-9]{8,15}$/.test(guardianWhatsapp)) {
    return { error: "Nomor WhatsApp wali tidak valid." };
  }

  const client = await createClient();
  const { error } = await client
    .from("students")
    .update({
      full_name: fullName,
      gender,
      status,
      nickname: nickname || null,
      nis: nis || null,
      nisn: nisn || null,
      guardian_name: guardianName || null,
      guardian_whatsapp: guardianWhatsapp || null,
    })
    .eq("id", id);

  if (error) {
    if (error.message.includes("students_tenant_nis_key")) return { error: `NIS "${nis}" sudah dipakai santri lain.` };
    if (error.message.includes("students_tenant_nisn_key")) return { error: `NISN "${nisn}" sudah dipakai santri lain.` };
    return { error: "Gagal memperbarui santri." };
  }

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: "Santri berhasil diperbarui." };
}

export async function deleteStudentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !isManager(profile.role)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Santri tidak valid." };

  const client = await createClient();
  const { error } = await client.from("students").delete().eq("id", id);
  if (error) return { error: "Gagal menghapus santri." };

  revalidateTenantPaths(profile.role, profile.tenantCode);
  return { success: "Santri berhasil dihapus." };
}

// ============================================================================
// Relasi
// ============================================================================

// V12: penugasan santri manual per guru DIHAPUS — binaan guru kini otomatis
// = anggota halaqah yang diampu (migration 20260915150000). Kelola keanggotaan
// lewat menu Halaqah (Pengampu & Anggota).

// ============================================================================
// DEVELOPER — Lembaga
// ============================================================================

export async function setTenantStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || (status !== "ACTIVE" && status !== "INACTIVE")) return { error: "Permintaan tidak valid." };

  // Tenants table is read-only for clients; platform ops go through service role.
  const admin = createAdminClient();
  const { error } = await admin.from("tenants").update({ status }).eq("id", id);
  if (error) return { error: "Gagal mengubah status lembaga." };

  revalidatePath("/developer");
  revalidatePath("/developer/lembaga");
  revalidatePath(`/developer/lembaga/${id}`);
  return { success: "Status lembaga diperbarui." };
}
