"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isTargetCategory, isTargetScope } from "@/lib/target-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V70 — Aksi target PER SANTRI (bisa banyak santri sekaligus).
 *
 * RPC SECURITY DEFINER memverifikasi ulang session → role USTADZ → tenant →
 * guru pengampu → semua santri valid aktif binaan → item milik katalog lembaga.
 * Satu panggilan = satu transaksi: gagal di satu santri = tidak ada tersimpan.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_TIDAK_VALID/, message: "Adapun santri yang dipilih bukan binaan aktif Anda — muat ulang halaman lalu pilih ulang." },
  { match: /SANTRI_TERLALU_BANYAK/, message: "Terlalu banyak santri sekaligus — maksimal 200 santri." },
  { match: /KATEGORI_TIDAK_VALID/, message: "Jenis target tidak valid." },
  { match: /CAKUPAN_TIDAK_VALID/, message: "Cakupan target tidak valid — pilih 1 tahun ajaran, semester ganjil, atau semester genap." },
  { match: /ISI_TARGET_KOSONG/, message: "Isi target masih kosong — pilih minimal satu item dari katalog." },
  { match: /ITEM_TIDAK_VALID/, message: "Ada item yang tidak ada di katalog lembaga — muat ulang halaman lalu pilih ulang." },
  { match: /ISI_TARGET_TERLALU_BANYAK/, message: "Isi target terlalu banyak — maksimal 500 item." },
  { match: /DESKRIPSI_TERLALU_PANJANG/, message: "Keterangan maksimal 300 karakter." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Target belum berhasil disimpan. Silakan coba lagi.";
}

function revalidateTarget() {
  revalidatePath("/ustadz/target");
  revalidatePath("/ustadz"); // widget dasbor: jumlah target aktif
}

export async function saveSantriTargetAction(input: {
  studentIds: string[];
  category: string;
  scope: string;
  itemIds: string[];
  description?: string | null;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const studentIds = (input.studentIds ?? []).filter((id) => UUID_RE.test(id));
  if (studentIds.length === 0) return { error: "Pilih minimal satu santri." };
  if (studentIds.length > 200) return { error: "Terlalu banyak santri sekaligus — maksimal 200 santri." };
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
  const { data, error } = await supabase.rpc("target_santri_save", {
    p_student_ids: studentIds,
    p_category: input.category,
    p_scope: input.scope,
    p_item_ids: itemIds,
    p_description: description || null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateTarget();
  const saved = Number(data ?? studentIds.length);
  return { success: `Target diterapkan ke ${saved} santri.` };
}

export async function clearSantriTargetAction(input: {
  studentIds: string[];
  category: string;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const studentIds = (input.studentIds ?? []).filter((id) => UUID_RE.test(id));
  if (studentIds.length === 0) return { error: "Adapun santri yang dipilih tidak valid." };
  if (!isTargetCategory(input.category)) return { error: "Jenis target tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_santri_clear", {
    p_student_ids: studentIds,
    p_category: input.category,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateTarget();
  return { success: "Target per santri dikosongkan." };
}
