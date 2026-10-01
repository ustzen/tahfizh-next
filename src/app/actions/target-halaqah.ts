"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isTargetCategory, isTargetScope } from "@/lib/target-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V17 (diperbarui V38) — Aksi Target per halaqah.
 *
 * Target diatur untuk satu halaqah (bukan per santri) dengan 3 jenis:
 * TAHFIDZ, HADITS, DOA. V54: isi target DIPILIH dari katalog lembaga
 * (surah/hadits/doa) — dikirim sebagai daftar ID (`itemIds`). RPC
 * SECURITY DEFINER memverifikasi ulang session → role USTADZ → tenant →
 * halaqah yang diampu → ID milik katalog lembaga.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /HALAQAH_TIDAK_VALID/, message: "Halaqah tidak valid atau bukan halaqah yang Anda ampu." },
  { match: /KATEGORI_TIDAK_VALID/, message: "Jenis target tidak valid." },
  { match: /CAKUPAN_TIDAK_VALID/, message: "Cakupan target tidak valid — pilih 1 tahun ajaran, semester ganjil, atau semester genap." },
  { match: /ISI_TARGET_KOSONG/, message: "Isi target masih kosong — pilih minimal satu item dari katalog." },
  { match: /ITEM_TIDAK_VALID/, message: "Ada item yang tidak ada di katalog lembaga — muat ulang halaman lalu pilih ulang." },
  { match: /ISI_TARGET_TERLALU_BANYAK/, message: "Isi target terlalu banyak — maksimal 500 item." },
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
  itemIds: string[];
  description?: string | null;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!isTargetCategory(input.category)) return { error: "Jenis target tidak valid." };
  if (!isTargetScope(input.scope)) {
    return { error: "Cakupan target tidak valid — pilih 1 tahun ajaran, semester ganjil, atau semester genap." };
  }
  const itemIds = (input.itemIds ?? []).filter((id) => UUID_RE.test(id));
  if (itemIds.length === 0) {
    return { error: "Isi target masih kosong — pilih minimal satu item dari katalog." };
  }
  const description = (input.description ?? "").trim();
  if (description.length > 300) return { error: "Keterangan maksimal 300 karakter." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_halaqah_save", {
    p_halaqah_id: input.halaqahId,
    p_category: input.category,
    p_scope: input.scope,
    p_item_ids: itemIds,
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
