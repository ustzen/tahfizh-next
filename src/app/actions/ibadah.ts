"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

export type IbadahResult = { error?: string; success?: string };

/** Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta. */
function todayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/** Pesan error RPC → teks Indonesia yang ramah. */
function ibadahError(message: string): string {
  if (message.includes("TANGGAL_FUTUR")) return "Tidak bisa mengisi untuk tanggal yang akan datang.";
  if (message.includes("AKTIVITAS_TIDAK_TERSEDIA")) return "Kegiatan tidak tersedia di lembaga Anda.";
  if (message.includes("LABEL_TIDAK_VALID")) return "Nama kegiatan harus 2–60 karakter.";
  if (message.includes("AKSES_DITOLAK")) return "Anda tidak memiliki akses.";
  return "Terjadi kesalahan. Coba lagi.";
}

const IBADAH_PATHS = ["/santri/jurnal-ibadah", "/admin/jurnal-ibadah", "/ustadz/jurnal-ibadah"];

/**
 * V51 — Simpan isian Jurnal Ibadah (satu centang per kegiatan/tanggal).
 * Data form: studentId, activityId, date, done ("1"/"0"), note (opsional).
 */
export async function saveIbadahLogAction(_prev: IbadahResult | null, formData: FormData): Promise<IbadahResult> {
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return { error: "Sesi berakhir. Muat ulang halaman." };

  const studentId = String(formData.get("studentId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  const date = String(formData.get("date") ?? "");
  const done = String(formData.get("done") ?? "1") === "1";
  const note = String(formData.get("note") ?? "");

  if (!studentId || !activityId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Data tidak lengkap." };
  }
  if (date > todayJakarta()) {
    return { error: "Tidak bisa mengisi untuk tanggal yang akan datang." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ibadah_log_upsert", {
    p_student_id: studentId,
    p_activity_id: activityId,
    p_date: date,
    p_done: done,
    p_note: note || null,
  });
  if (error) return { error: ibadahError(error.message) };

  for (const p of IBADAH_PATHS) revalidatePath(p);
  return { success: done ? "Tercatat." : "Dihapus dari jurnal." };
}

/** Tambah kegiatan baru ke katalog lembaga (ADMIN/KOORDINATOR/USTADZ). */
export async function saveIbadahActivityAction(
  _prev: IbadahResult | null,
  formData: FormData
): Promise<IbadahResult> {
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return { error: "Sesi berakhir. Muat ulang halaman." };
  if (!["ADMIN", "KOORDINATOR", "USTADZ"].includes(profile.role)) {
    return { error: "Hanya admin, koordinator, atau ustadz yang bisa mengatur kegiatan." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const tone = String(formData.get("tone") ?? "emerald");
  if (label.length < 2 || label.length > 60) {
    return { error: "Nama kegiatan harus 2–60 karakter." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ibadah_activity_save", {
    p_label: label,
    p_icon: "check",
    p_tone: tone,
    p_sort: 200,
  });
  if (error) return { error: ibadahError(error.message) };

  for (const p of IBADAH_PATHS) revalidatePath(p);
  return { success: `Kegiatan "${label}" ditambahkan.` };
}

/** Hapus kegiatan katalog milik lembaga (bawaan platform tidak bisa dihapus). */
export async function deleteIbadahActivityAction(_prev: IbadahResult | null, formData: FormData): Promise<IbadahResult> {
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return { error: "Sesi berakhir. Muat ulang halaman." };
  if (!["ADMIN", "KOORDINATOR", "USTADZ"].includes(profile.role)) {
    return { error: "Hanya admin, koordinator, atau ustadz yang bisa mengatur kegiatan." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Data tidak lengkap." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("ibadah_activity_delete", { p_id: id });
  if (error) return { error: ibadahError(error.message) };

  for (const p of IBADAH_PATHS) revalidatePath(p);
  return { success: "Kegiatan dihapus." };
}
