import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isTargetCategory,
  isTargetScope,
  type HalaqahTarget,
  type TargetCatalogItem,
  type TargetHalaqah,
  type TargetOverview,
} from "@/lib/target-shared";

/**
 * TAHFIZH V17 (diperbarui V38) — Target per halaqah (SERVER ONLY).
 *
 * Identitas (tenant/guru) selalu dari session di dalam RPC SECURITY DEFINER
 * `target_halaqah_overview` — bukan dari client. Hasil: halaqah aktif yang
 * diampu guru + target (maks. 3 jenis per halaqah) dengan cakupan
 * TAHUN/GANJIL/GENAP dan isi yang diketik guru (tanpa tanggal).
 */

type RawHalaqah = { id: string; name: string; studentCount?: number | string | null };
type RawTarget = {
  id: string;
  halaqahId: string;
  category: string;
  scope: string;
  items: string | null;
  itemIds: string[] | null;
  itemNames: string | null;
  targetValue: number | string;
  description: string | null;
  updatedAt: string;
};

const EMPTY: TargetOverview = { halaqah: [], targets: [] };

export async function getTargetOverview(): Promise<TargetOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_halaqah_overview");
  if (error || !data) {
    if (error) console.error("target_halaqah_overview failed:", error.message);
    return EMPTY;
  }

  const raw = data as { halaqah?: RawHalaqah[]; targets?: RawTarget[] };

  const halaqah: TargetHalaqah[] = (raw.halaqah ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    studentCount: Number(h.studentCount ?? 0),
  }));

  const targets: HalaqahTarget[] = [];
  for (const t of raw.targets ?? []) {
    if (!isTargetCategory(t.category)) continue; // abaikan nilai tak dikenal
    // V54: mode katalog — itemNames dari join katalog; fallback teks guru.
    const itemNames = (t.itemNames ?? t.items ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    targets.push({
      id: t.id,
      halaqahId: t.halaqahId,
      category: t.category,
      // Data lama (sebelum V38) belum punya scope → default TAHUN.
      scope: isTargetScope(t.scope) ? t.scope : "TAHUN",
      items: itemNames,
      itemIds: Array.isArray(t.itemIds) ? t.itemIds : [],
      targetValue: Number(t.targetValue ?? 0),
      description: t.description ?? null,
      updatedAt: t.updatedAt,
    });
  }

  return { halaqah, targets };
}

/**
 * V54/55 — Opsi katalog untuk picker & manajemen target guru: surah
 * (Tahfidz), hadits, doa — sesuai kategori. `all=true` ikut menyertakan item
 * nonaktif (untuk dialog kelola katalog). RPC SECURITY DEFINER, scope tenant
 * dari session.
 */
export async function getTargetCatalog(category: string, all = false): Promise<TargetCatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_catalog_list", {
    p_category: category,
    p_all: all,
  });
  if (error) {
    console.error("target_catalog_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: r.is_active === null ? true : Boolean(r.is_active),
  }));
}
