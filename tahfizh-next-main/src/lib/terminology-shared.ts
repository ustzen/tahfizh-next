/**
 * Client-safe terminology constants & pure helpers (no server imports).
 * The DB-backed resolver lives in src/lib/terminology.ts (server only).
 */
import type { AppRole } from "@/lib/roles";

export const TERMINOLOGY_KEYS = [
  "santri",
  "guru",
  "ustadz",
  "ustadzah",
  "wali_santri",
  "koordinator",
  "admin",
  "kepala_lembaga",
  "lembaga",
  "kelas",
  "halaqah",
] as const;

export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];
export type TerminologyMap = Record<TerminologyKey, string>;

export const DEFAULT_TERMINOLOGY: TerminologyMap = {
  santri: "Santri",
  guru: "Guru",
  ustadz: "Ustadz",
  ustadzah: "Ustadzah",
  wali_santri: "Santri",
  koordinator: "Koordinator",
  admin: "Admin",
  kepala_lembaga: "Kepala Sekolah",
  lembaga: "Lembaga",
  kelas: "Kelas",
  halaqah: "Halaqah",
};

/** "Drs." + "Ahmad Fauzi" + "M.Pd." -> "Drs. Ahmad Fauzi, M.Pd." */
export function formatFullName(
  frontTitle?: string | null,
  fullName?: string | null,
  backTitle?: string | null
): string {
  const parts: string[] = [];
  if (frontTitle?.trim()) parts.push(frontTitle.trim());
  if (fullName?.trim()) parts.push(fullName.trim());
  let out = parts.join(" ");
  if (backTitle?.trim()) out = out ? `${out}, ${backTitle.trim()}` : backTitle.trim();
  return out || "-";
}

/* ------------------------------------------------------------------------ */
/* Navigation model with stable keys (for per-user menu ordering) — moved   */
/* here (client-safe) so client components (e.g. mobile Menu Bawah) can use */
/* the NavEntry type and bottom-nav constants without pulling in the        */
/* server-only DB resolver from terminology.ts. terminology.ts re-exports   */
/* these for backward compatibility.                                       */
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
  | "prestasi"
  | "pantauan"
  | "infak"
  | "akademik"
  | "onboarding"
  | "perkembangan"
  | "obrolan"
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

/**
 * V32 — Menu Bawah (mobile bottom nav): 4 item bawaan per role, dari pool
 * menu penuh. Guru/pengguna dapat mengganti isinya (maks 4) lewat dialog
 * "Atur Menu Bawah" — tersimpan di profiles.bottom_nav_menu.
 */
export const BOTTOM_NAV_DEFAULT_KEYS: Record<AppRole, NavKey[]> = {
  DEVELOPER: ["dashboard", "lembaga", "infak", "pengaturan"],
  ADMIN: ["dashboard", "santri", "halaqah", "pengaturan"],
  KOORDINATOR: ["dashboard", "santri", "halaqah", "raport"],
  USTADZ: ["dashboard", "presensi", "setoran", "tahfidz"],
  WALI_SANTRI: ["dashboard", "pantauan", "presensi", "infak"],
};

/** Maksimum item Menu Bawah yang boleh tampil sekaligus (ruang layar mobile). */
export const BOTTOM_NAV_MAX_ITEMS = 4;

/**
 * Resolusi Menu Bawah: pilih (maks 4) dari seluruh item nav yang tersedia
 * untuk role ini (`allItems`, sudah terminology + menu_order aware), sesuai
 * `savedKeys` (urutan pilihan pengguna) atau default per role bila kosong.
 * Pure function (tidak menyentuh DB) — aman dipakai dari client maupun server.
 */
export function resolveBottomNav(
  role: AppRole,
  allItems: NavEntry[],
  savedKeys: string[] | null
): NavEntry[] {
  const byKey = new Map(allItems.map((i) => [i.key as string, i]));
  const keys =
    savedKeys && savedKeys.length > 0 ? savedKeys : BOTTOM_NAV_DEFAULT_KEYS[role];
  const resolved: NavEntry[] = [];
  for (const k of keys) {
    const item = byKey.get(k);
    if (item && !resolved.some((r) => r.key === item.key)) resolved.push(item);
    if (resolved.length >= BOTTOM_NAV_MAX_ITEMS) break;
  }
  if (resolved.length === 0 && allItems.length > 0) resolved.push(allItems[0]);
  return resolved;
}
