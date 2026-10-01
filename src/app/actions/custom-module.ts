"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V58 — Aksi modul lembaga kustom.
 * Kelola katalog (ADMIN/KOORDINATOR) dan pencatatan poin
 * (USTADZ: halaqahnya; ADMIN/KOOR: lembaga; WALI: anaknya) — semua lewat
 * RPC SECURITY DEFINER yang memverifikasi ulang cakupan di database.
 */

export type ModulActionResult = { error?: string; success?: string; id?: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK/, message: "Akses ditolak untuk aksi ini." },
  { match: /LABEL_TIDAK_VALID/, message: "Nama modul harus 2–40 karakter." },
  { match: /MODUL_TIDAK_DITEMUKAN/, message: "Modul tidak ditemukan — muat ulang halaman." },
  { match: /SANTRI_TIDAK_VALID/, message: "Santri tidak ada dalam cakupan Anda." },
  { match: /TANGGAL_FUTUR/, message: "Tanggal tidak boleh lebih dari hari ini." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Aksi belum berhasil. Silakan coba lagi.";
}

function revalidateSemua() {
  revalidatePath("/santri");
  revalidatePath("/ustadz/modul");
  revalidatePath("/admin/modul");
  revalidatePath("/koordinator/modul");
}

export async function saveCustomModuleAction(input: {
  id?: string | null;
  label: string;
  icon: string;
  tone: string;
  poinTarget: number;
  sortOrder?: number;
}): Promise<ModulActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !["ADMIN", "KOORDINATOR"].includes(profile.role)) {
    return { error: "Hanya admin atau koordinator lembaga yang bisa mengelola modul." };
  }

  const label = (input.label ?? "").trim();
  if (label.length < 2 || label.length > 40) {
    return { error: "Nama modul harus 2–40 karakter." };
  }
  if (input.id && !UUID_RE.test(input.id)) return { error: "Modul tidak valid." };
  const poinTarget = Math.max(0, Math.min(10000, Math.round(input.poinTarget || 0)));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("custom_module_save", {
    p_id: input.id ?? null,
    p_label: label,
    p_icon: input.icon || "star",
    p_tone: input.tone || "emerald",
    p_poin_target: poinTarget,
    p_sort: input.sortOrder ?? 100,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateSemua();
  return { success: input.id ? "Modul diperbarui." : "Modul ditambahkan.", id: (data as string) ?? undefined };
}

export async function deleteCustomModuleAction(input: { id: string }): Promise<ModulActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !["ADMIN", "KOORDINATOR"].includes(profile.role)) {
    return { error: "Hanya admin atau koordinator lembaga yang bisa menghapus modul." };
  }
  if (!UUID_RE.test(input.id)) return { error: "Modul tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("custom_module_delete", { p_id: input.id });
  if (error) return { error: friendlyError(error.message) };

  revalidateSemua();
  return { success: "Modul dihapus (beserta catatan poinnya)." };
}

export async function logCustomModuleAction(input: {
  studentId: string;
  moduleId: string;
  date: string;
  note?: string | null;
}): Promise<ModulActionResult> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.moduleId)) {
    return { error: "Data tidak valid." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("custom_module_log_save", {
    p_student_id: input.studentId,
    p_module_id: input.moduleId,
    p_log_date: input.date,
    p_note: (input.note ?? "").trim() || null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateSemua();
  return { success: "Poin kemajuan dicatat." };
}

export async function deleteCustomModuleLogAction(input: { id: string }): Promise<ModulActionResult> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.id)) return { error: "Catatan tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("custom_module_log_delete", { p_id: input.id });
  if (error) return { error: friendlyError(error.message) };

  revalidateSemua();
  return { success: "Catatan dihapus." };
}
