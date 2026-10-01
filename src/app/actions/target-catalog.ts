"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V55 — Aksi kelola katalog target oleh guru.
 *
 * Guru (dan tetap admin/koordinator) bisa menambah / mengganti nama /
 * menyembunyikan / menghapus item katalog acuan target — surah (Tahfidz),
 * hadits, dan doa — langsung dari menu Target. Semua lewat RPC SECURITY
 * DEFINER yang memverifikasi session & tenant; ID dianggap opaque.
 */

export type CatalogActionResult = { error?: string; success?: string; id?: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK/, message: "Akses ditolak — hanya guru, koordinator, atau admin lembaga." },
  { match: /KATEGORI_TIDAK_VALID/, message: "Jenis katalog tidak valid." },
  { match: /NAMA_TIDAK_VALID/, message: "Nama item harus 1–160 karakter." },
  { match: /DUPLIKAT_KATALOG/, message: "Item dengan nama itu sudah ada di katalog." },
  { match: /ITEM_TIDAK_DITEMUKAN/, message: "Item tidak ditemukan — muat ulang halaman." },
  { match: /duplicate key value/, message: "Item dengan nama itu sudah ada di katalog." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Katalog belum berhasil disimpan. Silakan coba lagi.";
}

async function requireGuru() {
  const profile = await getSessionProfile();
  if (profile && profile.tenantId && ["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role)) {
    return profile;
  }
  return null;
}

function revalidateCatalog() {
  revalidatePath("/ustadz/target");
  revalidatePath("/admin/tahfidz");
  revalidatePath("/koordinator/tahfidz");
  revalidatePath("/admin/hadits");
  revalidatePath("/koordinator/hadits");
  revalidatePath("/admin/doa");
  revalidatePath("/koordinator/doa");
  revalidatePath("/ustadz/hadits");
  revalidatePath("/ustadz/doa");
}

export async function saveTargetCatalogItemAction(input: {
  category: string;
  id?: string | null;
  name: string;
  sortOrder?: number;
}): Promise<CatalogActionResult> {
  const profile = await requireGuru();
  if (!profile) return { error: "Akses ditolak." };

  if (!["TAHFIDZ", "HADITS", "DOA"].includes(input.category)) {
    return { error: "Jenis katalog tidak valid." };
  }
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 160) {
    return { error: "Nama item harus 1–160 karakter." };
  }
  if (input.id && !UUID_RE.test(input.id)) return { error: "Item tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_catalog_save", {
    p_category: input.category,
    p_id: input.id ?? null,
    p_name: name,
    p_sort: input.sortOrder ?? 100,
    p_active: true,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateCatalog();
  return { success: input.id ? "Nama item diperbarui." : "Item katalog ditambahkan.", id: (data as string) ?? undefined };
}

export async function toggleTargetCatalogItemAction(input: {
  category: string;
  id: string;
  active: boolean;
}): Promise<CatalogActionResult> {
  const profile = await requireGuru();
  if (!profile) return { error: "Akses ditolak." };
  if (!UUID_RE.test(input.id)) return { error: "Item tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_catalog_toggle", {
    p_id: input.id,
    p_category: input.category,
    p_active: input.active,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateCatalog();
  return { success: input.active ? "Item ditampilkan." : "Item disembunyikan." };
}

export async function deleteTargetCatalogItemAction(input: {
  category: string;
  id: string;
}): Promise<CatalogActionResult> {
  const profile = await requireGuru();
  if (!profile) return { error: "Akses ditolak." };
  if (!UUID_RE.test(input.id)) return { error: "Item tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_catalog_delete", {
    p_id: input.id,
    p_category: input.category,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateCatalog();
  return { success: "Item dihapus dari katalog." };
}
