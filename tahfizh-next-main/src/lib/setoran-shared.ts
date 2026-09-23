/**
 * TAHFIZH V5 — client-safe Setoran constants (no server imports).
 * Server data access lives in src/lib/setoran.ts (import "server-only").
 */

export const SUBMISSION_KINDS = ["HAFALAN_BARU", "MUROJAAH"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

export const SUBMISSION_KIND_LABELS: Record<SubmissionKind, string> = {
  HAFALAN_BARU: "Hafalan Baru",
  MUROJAAH: "Murojaah",
};

export const SUBMISSION_RESULTS = ["LULUS", "PERLU_MENGULANG", "DITUNDA"] as const;
export type SubmissionResult = (typeof SUBMISSION_RESULTS)[number];

export const SUBMISSION_RESULT_LABELS: Record<SubmissionResult, string> = {
  LULUS: "Lulus",
  PERLU_MENGULANG: "Perlu Mengulang",
  DITUNDA: "Ditunda",
};

/** Result → badge tone (kept in one place for list/cards/timeline). */
export const SUBMISSION_RESULT_STYLES: Record<SubmissionResult, string> = {
  LULUS: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PERLU_MENGULANG: "border-amber-200 bg-amber-50 text-amber-700",
  DITUNDA: "border-slate-200 bg-slate-100 text-slate-600",
};

export const SUBMISSION_NOTE_SLOTS = [
  "APRESIASI",
  "KELANCARAN",
  "KESALAHAN",
  "SARAN",
  "CATATAN_ORANG_TUA",
] as const;
export type SubmissionNoteSlot = (typeof SUBMISSION_NOTE_SLOTS)[number];

export const SUBMISSION_NOTE_SLOT_LABELS: Record<SubmissionNoteSlot, string> = {
  APRESIASI: "Apresiasi",
  KELANCARAN: "Kelancaran",
  KESALAHAN: "Kesalahan",
  SARAN: "Saran",
  CATATAN_ORANG_TUA: "Catatan untuk Orang Tua",
};

/** Filters on the setoran list/detail (rule #24). */
export const SUBMISSION_FILTERS = [
  "ALL",
  "HAFALAN_BARU",
  "MUROJAAH",
  "LULUS",
  "PERLU_MENGULANG",
  "DITUNDA",
] as const;
export type SubmissionFilter = (typeof SUBMISSION_FILTERS)[number];

export const SUBMISSION_FILTER_LABELS: Record<SubmissionFilter, string> = {
  ALL: "Semua",
  HAFALAN_BARU: "Hafalan Baru",
  MUROJAAH: "Murojaah",
  LULUS: "Lulus",
  PERLU_MENGULANG: "Perlu Mengulang",
  DITUNDA: "Ditunda",
};
