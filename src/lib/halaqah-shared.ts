/**
 * TAHFIZH V8 — client-safe halaqah/attendance constants (no server imports).
 * Server data access lives in src/lib/halaqah.ts (import "server-only").
 */

export const ATTENDANCE_STATUSES = ["HADIR", "IZIN", "SAKIT", "ALPA"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Short letter shown on the big quick buttons and per-student chips. */
export const STATUS_LETTER: Record<AttendanceStatus, string> = {
  HADIR: "H",
  IZIN: "I",
  SAKIT: "S",
  ALPA: "A",
};

/**
 * Distinct hue per status; also carries a letter + icon so the status stays
 * readable without color (rule #56/#75 accessibility).
 */
export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; letter: string; chip: string; solid: string; dot: string }
> = {
  HADIR: {
    label: "Hadir",
    letter: "H",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    solid: "bg-emerald-500 text-white",
    dot: "bg-emerald-500",
  },
  IZIN: {
    label: "Izin",
    letter: "I",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    solid: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  SAKIT: {
    label: "Sakit",
    letter: "S",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    solid: "bg-sky-500 text-white",
    dot: "bg-sky-500",
  },
  ALPA: {
    label: "Alpa",
    letter: "A",
    chip: "border-red-200 bg-red-50 text-red-700",
    solid: "bg-red-500 text-white",
    dot: "bg-red-500",
  },
};

export type HalaqahListItem = {
  id: string;
  businessCode: string;
  name: string;
  description: string;
  status: string;
  teacherNames: string;
  studentCount: number;
  isPrimary?: boolean;
  teacherIds?: string[];
};

export type HalaqahMember = { id: string; name: string; code: string; gender: "L" | "P" };

export type HalaqahTeacher = { id: string; name: string; code: string; isPrimary: boolean };

export type AttendanceEntry = { status: AttendanceStatus | null; note: string };

/** Client-side summary counts for the confirm strip (rule #25). */
export function countStatuses(entries: Record<string, AttendanceEntry>) {
  const counts = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0, unset: 0 };
  for (const e of Object.values(entries)) {
    if (e.status) counts[e.status] += 1;
    else counts.unset += 1;
  }
  return counts;
}

export function todayISO(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

export function formatDateID(iso: string): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
