/**
 * TAHFIZH V2 — Terminology resolver (SERVER ONLY).
 *
 * Tenant-specific UI labels. Database table/column names are NEVER changed
 * (rule #38) — only display labels. Missing keys fall back to TAHFIZH
 * defaults so nothing breaks when a lembaga has no customization.
 *
 * Pure constants/formatters that client components need live in
 * terminology-shared.ts (import that from client components).
 */
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_TERMINOLOGY,
  TERMINOLOGY_KEYS,
  type TerminologyKey,
  type TerminologyMap,
} from "@/lib/terminology-shared";
import type { AppRole } from "@/lib/roles";

export { DEFAULT_TERMINOLOGY, TERMINOLOGY_KEYS, formatFullName } from "@/lib/terminology-shared";
export type { TerminologyKey, TerminologyMap } from "@/lib/terminology-shared";

/** Resolve custom labels for a tenant; missing keys keep defaults. */
export async function getTerminology(tenantId: string | null): Promise<TerminologyMap> {
  if (!tenantId) return { ...DEFAULT_TERMINOLOGY };
  return getCachedTerminology(tenantId);
}

/** Request-level dedupe: layouts + pages share one DB read per render. */
const getCachedTerminology = cache(async (tenantId: string): Promise<TerminologyMap> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("terminologies")
    .select("key, label")
    .eq("tenant_id", tenantId);

  const merged: TerminologyMap = { ...DEFAULT_TERMINOLOGY };
  for (const row of data ?? []) {
    if ((TERMINOLOGY_KEYS as readonly string[]).includes(row.key)) {
      merged[row.key as TerminologyKey] = row.label;
    }
  }
  return merged;
});

/** Check whether a tenant has ANY customization (for empty states). */
export async function hasCustomTerminology(tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("terminologies")
    .select("key", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return (count ?? 0) > 0;
}

/* ------------------------------------------------------------------------ */
/* Navigation model with stable keys (for per-user menu ordering)            */
/* ------------------------------------------------------------------------ */

export type NavKey =
  | "dashboard"
  | "lembaga"
  | "guru"
  | "santri"
  | "tahfidz"
  | "tartil"
  | "setoran"
  | "hadits"
  | "doa"
  | "tajwid"
  | "tugas"
  | "jurnal"
  | "target"
  | "raport"
  | "halaqah"
  | "presensi"
  | "anak"
  | "infak"
  | "akademik"
  | "onboarding"
  | "perkembangan"
  | "saran"
  | "pengaturan";

export type NavEntry = { key: NavKey; label: string; href: string };

/** V12 — kelompok menu berlabel (kategori) dengan warna aksen di UI. */
export type NavGroupKey =
  | "utama"
  | "master"
  | "pembelajaran"
  | "presensi"
  | "laporan"
  | "keuangan"
  | "komunitas"
  | "pengaturan";

export type NavGroup = { key: NavGroupKey; items: NavEntry[] };

/** Kategori tiap menu — dipakai resolveNav untuk mengelompokkan. */
const NAV_GROUP_OF: Record<NavKey, NavGroupKey> = {
  dashboard: "utama",
  lembaga: "utama",
  guru: "master",
  santri: "master",
  halaqah: "master",
  akademik: "utama",
  onboarding: "utama",
  tahfidz: "pembelajaran",
  tartil: "pembelajaran",
  setoran: "pembelajaran",
  hadits: "pembelajaran",
  doa: "pembelajaran",
  tajwid: "pembelajaran",
  tugas: "pembelajaran",
  jurnal: "pembelajaran",
  target: "pembelajaran",
  presensi: "presensi",
  perkembangan: "laporan",
  raport: "laporan",
  anak: "master",
  infak: "keuangan",
  saran: "komunitas",
  pengaturan: "pengaturan",
};

const GROUP_ORDER: NavGroupKey[] = [
  "utama",
  "master",
  "pembelajaran",
  "presensi",
  "laporan",
  "keuangan",
  "komunitas",
  "pengaturan",
];

const BASE_NAV: Record<AppRole, { key: NavKey; label: string; href: string }[]> = {
  DEVELOPER: [
    { key: "dashboard", label: "Dashboard", href: "/developer" },
    { key: "lembaga", label: "Lembaga", href: "/developer/lembaga" },
    { key: "infak", label: "Infak", href: "/developer/infak" },
    { key: "raport", label: "Raport", href: "/developer/raport" },
    { key: "saran", label: "Kritik & Saran", href: "/developer/saran" },
    { key: "pengaturan", label: "Pengaturan", href: "/developer/pengaturan" },
  ],
  ADMIN: [
    { key: "dashboard", label: "Ringkasan", href: "/admin" }, // V12: dashboard admin = Ringkasan
    { key: "guru", label: "Data Guru", href: "/admin/guru" }, // V12: menu terpisah + export/import Excel
    { key: "santri", label: "Data Santri", href: "/admin/santri" },
    { key: "halaqah", label: "Halaqah", href: "/admin/halaqah" },
    { key: "raport", label: "Raport", href: "/admin/raport" },
    { key: "akademik", label: "Akademik", href: "/admin/akademik" },
    { key: "onboarding", label: "Onboarding", href: "/admin/onboarding" },
    { key: "saran", label: "Kritik & Saran", href: "/admin/saran" },
    { key: "pengaturan", label: "Pengaturan", href: "/admin/pengaturan" },
  ],
  KOORDINATOR: [
    { key: "dashboard", label: "Dashboard", href: "/koordinator" },
    { key: "guru", label: "Data Guru", href: "/koordinator/guru" }, // V12: menu terpisah
    { key: "santri", label: "Data Santri", href: "/koordinator/santri" },
    { key: "halaqah", label: "Halaqah", href: "/koordinator/halaqah" },
    { key: "hadits", label: "Hadits", href: "/koordinator/hadits" }, // V12.11: menu grid penilaian (halaman V12.7)
    { key: "doa", label: "Doa Harian", href: "/koordinator/doa" },
    { key: "perkembangan", label: "Riwayat Perkembangan", href: "/koordinator/perkembangan" },
    { key: "raport", label: "Raport", href: "/koordinator/raport" },
    { key: "saran", label: "Kritik & Saran", href: "/koordinator/saran" },
    { key: "pengaturan", label: "Pengaturan", href: "/koordinator/pengaturan" },
  ],
  USTADZ: [
    { key: "dashboard", label: "Dashboard", href: "/ustadz" },
    { key: "santri", label: "Santri", href: "/ustadz/santri" },
    { key: "tahfidz", label: "Tahfidz", href: "/ustadz/tahfidz" },
    { key: "tartil", label: "Tartil", href: "/ustadz/tartil" },
    { key: "setoran", label: "Setoran", href: "/ustadz/setoran" },
    { key: "hadits", label: "Hadits", href: "/ustadz/hadits" },
    { key: "doa", label: "Doa Harian", href: "/ustadz/doa" },
    { key: "tajwid", label: "Tajwid", href: "/ustadz/tajwid" },
    { key: "tugas", label: "Tugas", href: "/ustadz/tugas" },
    { key: "jurnal", label: "Custom Jurnal", href: "/ustadz/jurnal" },
    { key: "target", label: "Target", href: "/ustadz/target" },
    { key: "halaqah", label: "Halaqah", href: "/ustadz/halaqah" },
    { key: "presensi", label: "Presensi", href: "/ustadz/presensi" },
    { key: "perkembangan", label: "Riwayat Perkembangan", href: "/ustadz/perkembangan" },
    { key: "raport", label: "Raport", href: "/ustadz/raport" },
    { key: "saran", label: "Kritik & Saran", href: "/ustadz/saran" },
    { key: "pengaturan", label: "Pengaturan", href: "/ustadz/pengaturan" },
  ],
  WALI_SANTRI: [
    { key: "dashboard", label: "Dashboard", href: "/santri" },
    { key: "anak", label: "Data Saya", href: "/santri/anak" },
    { key: "perkembangan", label: "Riwayat Perkembangan", href: "/santri/perkembangan" },
    { key: "infak", label: "Infak", href: "/santri/infak" },
    { key: "saran", label: "Kritik & Saran", href: "/santri/saran" },
    { key: "pengaturan", label: "Pengaturan", href: "/santri/pengaturan" },
  ],
};

/**
 * Resolve final nav for a role: terminology-aware labels + the user's own
 * menu ordering + kategori berlabel (V12 #21/#48).
 */
export function resolveNavGroups(
  role: AppRole,
  terms: TerminologyMap,
  gender: "L" | "P" | null,
  menuOrder: string[] | null
): NavGroup[] {
  const entries = resolveNav(role, terms, gender, menuOrder);
  const groups = new Map<NavGroupKey, NavEntry[]>();
  for (const item of entries) {
    const g = NAV_GROUP_OF[item.key] ?? "utama";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(item);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ key: g, items: groups.get(g)! }));
}

/**
 * Resolve final nav for a role: terminology-aware labels + the user's own
 * menu ordering. Unknown/unset keys keep default order at the end.
 */
export function resolveNav(
  role: AppRole,
  terms: TerminologyMap,
  gender: "L" | "P" | null,
  menuOrder: string[] | null
): NavEntry[] {
  const items = BASE_NAV[role].map((item) => {
    let label = item.label;
    if (item.key === "guru") label = `Data ${terms.guru}`;
    if (item.key === "santri") label = `Data ${terms.santri}`;
    if (item.key === "halaqah") label = terms.halaqah; // rule #3: terminology engine V2
    return { ...item, label };
  });

  if (!menuOrder || menuOrder.length === 0) return items;

  const byKey = new Map<string, NavEntry>(items.map((i) => [i.key as string, i]));
  const ordered: NavEntry[] = [];
  for (const key of menuOrder) {
    const item = byKey.get(key);
    if (item) {
      ordered.push(item);
      byKey.delete(key);
    }
  }
  // Append anything not mentioned in the preference (keeps new menus visible).
  for (const item of items) {
    if (byKey.has(item.key as string)) ordered.push(item);
  }
  return ordered;
}
