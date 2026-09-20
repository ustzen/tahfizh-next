/**
 * TAHFIZH V7 — client-safe Target / Tugas / Jurnal constants (no server
 * imports). Server data access lives in target.ts, task.ts, journal.ts
 * (import "server-only").
 */

/* ------------------------------- TARGET ---------------------------------- */

export const TARGET_MODULES = [
  "TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID", "CUSTOM",
] as const;
export type TargetModule = (typeof TARGET_MODULES)[number];

export const TARGET_MODULE_LABELS: Record<TargetModule, string> = {
  TAHFIDZ: "Tahfidz",
  TARTIL: "Tartil",
  SETORAN: "Setoran",
  HADITS: "Hadits",
  DOA: "Doa Harian",
  TAJWID: "Tajwid",
  CUSTOM: "Custom",
};

export const TARGET_STATUSES = [
  "BELUM_MULAI", "BERJALAN", "TERCAPAI", "TERLAMBAT", "DIBATALKAN",
] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const TARGET_STATUS_STYLES: Record<TargetStatus, string> = {
  BELUM_MULAI: "border-slate-200 bg-slate-100 text-slate-600",
  BERJALAN: "border-blue-200 bg-blue-50 text-blue-700",
  TERCAPAI: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TERLAMBAT: "border-amber-200 bg-amber-50 text-amber-700",
  DIBATALKAN: "border-slate-200 bg-slate-100 text-slate-500",
};

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  BELUM_MULAI: "Belum Mulai",
  BERJALAN: "Berjalan",
  TERCAPAI: "Tercapai",
  TERLAMBAT: "Terlambat",
  DIBATALKAN: "Dibatalkan",
};

export function targetStatusLabel(v: string): string {
  return TARGET_STATUS_LABELS[v as TargetStatus] ?? v;
}

export function targetStatusStyle(v: string): string {
  return TARGET_STATUS_STYLES[v as TargetStatus] ?? TARGET_STATUS_STYLES.BELUM_MULAI;
}

export function targetPercent(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

/* -------------------------------- TUGAS ---------------------------------- */

export const TASK_STATUSES = [
  "BELUM_DIKERJAKAN", "DIKERJAKAN", "DIKUMPULKAN", "DINILAI", "TERLAMBAT",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  BELUM_DIKERJAKAN: "border-slate-200 bg-slate-100 text-slate-600",
  DIKERJAKAN: "border-blue-200 bg-blue-50 text-blue-700",
  DIKUMPULKAN: "border-cyan-200 bg-cyan-50 text-cyan-700",
  DINILAI: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TERLAMBAT: "border-amber-200 bg-amber-50 text-amber-700",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  BELUM_DIKERJAKAN: "Belum Dikerjakan",
  DIKERJAKAN: "Dikerjakan",
  DIKUMPULKAN: "Dikumpulkan",
  DINILAI: "Dinilai",
  TERLAMBAT: "Terlambat",
};

export const TASK_STATUS_DOTS: Record<TaskStatus, string> = {
  BELUM_DIKERJAKAN: "bg-slate-400",
  DIKERJAKAN: "bg-blue-500",
  DIKUMPULKAN: "bg-cyan-500",
  DINILAI: "bg-emerald-500",
  TERLAMBAT: "bg-amber-500",
};

export function taskStatusLabel(v: string): string {
  return TASK_STATUS_LABELS[v as TaskStatus] ?? v;
}

export function taskStatusStyle(v: string): string {
  return TASK_STATUS_STYLES[v as TaskStatus] ?? TASK_STATUS_STYLES.BELUM_DIKERJAKAN;
}

export const TASK_MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "TAHFIDZ", label: "Tahfidz" },
  { value: "TARTIL", label: "Tartil" },
  { value: "SETORAN", label: "Setoran" },
  { value: "HADITS", label: "Hadits" },
  { value: "DOA", label: "Doa Harian" },
  { value: "TAJWID", label: "Tajwid" },
  { value: "CUSTOM", label: "Custom" },
];

/* --------------------------- CUSTOM JURNAL -------------------------------- */

export const JOURNAL_FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "CHECKBOX", "DATE", "TEXTAREA"] as const;
export type JournalFieldType = (typeof JOURNAL_FIELD_TYPES)[number];

export const JOURNAL_FIELD_TYPE_LABELS: Record<JournalFieldType, string> = {
  TEXT: "Teks",
  NUMBER: "Angka",
  SELECT: "Pilihan",
  CHECKBOX: "Checkbox",
  DATE: "Tanggal",
  TEXTAREA: "Teks Panjang",
};

export type JournalFieldDef = {
  id?: string;
  label: string;
  type: JournalFieldType;
  required: boolean;
  options?: string[] | null;
};

/** Template fields as returned by the RPCs. */
export type JournalFieldDto = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  sortOrder: number;
};

export function journalFieldLabel(type: string): string {
  return JOURNAL_FIELD_TYPE_LABELS[type as JournalFieldType] ?? type;
}

export function formatJournalValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "";
  if (type === "CHECKBOX") return value === true || value === "true" ? "✓" : "—";
  return String(value);
}
