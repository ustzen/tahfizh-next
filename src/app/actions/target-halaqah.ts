"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isTargetCategory } from "@/lib/target-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V17 — Aksi Target per halaqah.
 *
 * Target diatur untuk satu halaqah (bukan per santri) dengan 3 jenis:
 * TAHFIDZ, HADITS, DOA. Semua penulisan lewat RPC SECURITY DEFINER yang
 * memverifikasi ulang session → role USTADZ → tenant → halaqah yang diampu.
 * Validasi di sini hanya untuk umpan balik cepat.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /HALAQAH_TIDAK_VALID/, message: "Halaqah tidak valid atau bukan halaqah yang Anda ampu." },
  { match: /KATEGORI_TIDAK_VALID/, message: "Jenis target tidak valid." },
  { match: /TARGET_TIDAK_VALID/, message: "Jumlah target harus bilangan bulat 1–10000." },
  { match: /PERIODE_TIDAK_VALID/, message: "Periode tidak valid — tanggal selesai tidak boleh sebelum tanggal mulai (maksimal 3 tahun)." },
  { match: /DESKRIPSI_TERLALU_PANJANG/, message: "Keterangan maksimal 300 karakter." },
  { match: /TARGET_TIDAK_DITEMUKAN/, message: "Target tidak ditemukan — mungkin sudah dikosongkan. Muat ulang halaman." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Target belum berhasil disimpan. Silakan coba lagi.";
}

function requireUstadz() {
  return getSessionProfile().then((profile) =>
    profile && profile.role === "USTADZ" && profile.tenantId ? profile : null
  );
}

function revalidateTarget() {
  revalidatePath("/ustadz/target");
  revalidatePath("/ustadz"); // widget dasbor: jumlah target aktif
}

export async function saveHalaqahTargetAction(input: {
  halaqahId: string;
  category: string;
  targetValue: number;
  startDate: string;
  endDate: string;
  description?: string | null;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!isTargetCategory(input.category)) return { error: "Jenis target tidak valid." };
  if (!Number.isInteger(input.targetValue) || input.targetValue < 1 || input.targetValue > 10000) {
    return { error: "Jumlah target harus bilangan bulat 1–10000." };
  }
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { error: "Tanggal mulai dan selesai wajib diisi." };
  }
  if (input.endDate < input.startDate) {
    return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }
  const description = (input.description ?? "").trim();
  if (description.length > 300) return { error: "Keterangan maksimal 300 karakter." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_halaqah_save", {
    p_halaqah_id: input.halaqahId,
    p_category: input.category,
    p_target_value: input.targetValue,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_description: description || null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateTarget();
  return { success: "Target halaqah tersimpan." };
}

export async function clearHalaqahTargetAction(input: {
  halaqahId: string;
  category: string;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!isTargetCategory(input.category)) return { error: "Jenis target tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_halaqah_clear", {
    p_halaqah_id: input.halaqahId,
    p_category: input.category,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateTarget();
  return { success: "Target dikosongkan." };
}
