"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isTargetCategory, isTargetScope, targetItemsTooLong } from "@/lib/target-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V17 (diperbarui V38) — Aksi Target per halaqah.
 *
 * Target diatur untuk satu halaqah (bukan per santri) dengan 3 jenis:
 * TAHFIDZ, HADITS, DOA. Isi target DIKETIK guru (daftar nama — surat/hadits/
 * doa) dan cakupannya TAHUN / GANJIL / GENAP; tidak ada tanggal mulai/selesai.
 * Semua penulisan lewat RPC SECURITY DEFINER yang memverifikasi ulang
 * session → role USTADZ → tenant → halaqah yang diampu. Validasi di sini hanya
 * untuk umpan balik cepat.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /HALAQAH_TIDAK_VALID/, message: "Halaqah tidak valid atau bukan halaqah yang Anda ampu." },
  { match: /KATEGORI_TIDAK_VALID/, message: "Jenis target tidak valid." },
  { match: /CAKUPAN_TIDAK_VALID/, message: "Cakupan target tidak valid — pilih 1 tahun ajaran, semester ganjil, atau semester genap." },
  { match: /ISI_TARGET_KOSONG/, message: "Isi target belum diisi — ketik minimal satu nama." },
  { match: /ISI_TARGET_TERLALU_BANYAK/, message: "Isi target terlalu banyak — maksimal 500 nama." },
  { match: /ISI_TARGET_TERLALU_PANJANG/, message: "Isi target terlalu panjang — total maksimal 5000 karakter." },
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
  scope: string;
  items: string;
  description?: string | null;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!isTargetCategory(input.category)) return { error: "Jenis target tidak valid." };
  if (!isTargetScope(input.scope)) {
    return { error: "Cakupan target tidak valid — pilih 1 tahun ajaran, semester ganjil, atau semester genap." };
  }
  const items = (input.items ?? "").trim();
  if (!items) return { error: "Isi target belum diisi — ketik minimal satu nama." };
  if (targetItemsTooLong(items)) return { error: "Isi target terlalu panjang — total maksimal 5000 karakter." };
  const description = (input.description ?? "").trim();
  if (description.length > 300) return { error: "Keterangan maksimal 300 karakter." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_halaqah_save", {
    p_halaqah_id: input.halaqahId,
    p_category: input.category,
    p_scope: input.scope,
    p_items: items,
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
