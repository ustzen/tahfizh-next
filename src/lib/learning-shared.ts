/**
 * TAHFIZH V6 — client-safe learning-module configuration (no server imports).
 * Single generic engine, three module configs (rule #2/#20 reusable structure).
 * Server data access lives in src/lib/learning.ts (import "server-only").
 */

export const LEARNING_MODULES = ["HADITS", "DOA", "TAJWID"] as const;
export type LearningModule = (typeof LEARNING_MODULES)[number];

export type LearningModuleConfig = {
  key: LearningModule;
  label: string;
  /** Short label used in dashboard chips. */
  shortLabel: string;
  /** Route prefix under /ustadz. */
  href: string;
  /** Structured-note slots (rule #10/#19) — validated again by the RPC. */
  noteSlots: readonly string[];
  /** Status vocabulary per module (rule #9/#18). */
  statuses: readonly { value: string; label: string; style: string }[];
};

const PASS_FAIL_STATUSES = [
  { value: "LULUS", label: "Lulus", style: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "PERLU_MENGULANG", label: "Perlu Mengulang", style: "border-amber-200 bg-amber-50 text-amber-700" },
  { value: "BELUM_SELESAI", label: "Belum Selesai", style: "border-slate-200 bg-slate-100 text-slate-600" },
] as const;

const TAJWID_STATUSES = [
  { value: "MENGUASAI", label: "Menguasai", style: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "PERLU_LATIHAN", label: "Perlu Latihan", style: "border-amber-200 bg-amber-50 text-amber-700" },
  { value: "BELUM_MENGUASAI", label: "Belum Menguasai", style: "border-slate-200 bg-slate-100 text-slate-600" },
] as const;

export const LEARNING_MODULE_CONFIGS: Record<LearningModule, LearningModuleConfig> = {
  HADITS: {
    key: "HADITS",
    label: "Hadits",
    shortLabel: "Hadits",
    href: "/ustadz/hadits",
    noteSlots: ["APRESIASI", "HAFALAN", "BACAAN", "SARAN", "CATATAN_ORANG_TUA"],
    statuses: PASS_FAIL_STATUSES,
  },
  DOA: {
    key: "DOA",
    label: "Doa Harian",
    shortLabel: "Doa",
    href: "/ustadz/doa",
    noteSlots: ["APRESIASI", "HAFALAN", "PELAFALAN", "PENGAMALAN", "CATATAN_ORANG_TUA"],
    statuses: PASS_FAIL_STATUSES,
  },
  TAJWID: {
    key: "TAJWID",
    label: "Tajwid",
    shortLabel: "Tajwid",
    href: "/ustadz/tajwid",
    noteSlots: ["PEMAHAMAN", "PENERAPAN", "KESALAHAN", "SARAN", "CATATAN_ORANG_TUA"],
    statuses: TAJWID_STATUSES,
  },
};

export const NOTE_SLOT_LABELS: Record<string, string> = {
  APRESIASI: "Apresiasi",
  HAFALAN: "Hafalan",
  BACAAN: "Bacaan",
  PELAFALAN: "Pelafalan",
  PENGAMALAN: "Pengamalan",
  PEMAHAMAN: "Pemahaman",
  PENERAPAN: "Penerapan",
  KESALAHAN: "Kesalahan",
  SARAN: "Saran",
  CATATAN_ORANG_TUA: "Catatan untuk Orang Tua",
};

/** Status label lookup across both vocabularies. */
export function learningStatusLabel(value: string): string {
  return (
    [...PASS_FAIL_STATUSES, ...TAJWID_STATUSES].find((s) => s.value === value)?.label ?? value
  );
}

export function learningStatusStyle(value: string): string {
  return (
    [...PASS_FAIL_STATUSES, ...TAJWID_STATUSES].find((s) => s.value === value)?.style ??
    "border-slate-200 bg-slate-100 text-slate-600"
  );
}
