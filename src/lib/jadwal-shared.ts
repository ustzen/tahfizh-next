/**
 * TAHFIZH V47 — client-safe jadwal constants & types (no server imports).
 * Server data access lives in src/lib/jadwal.ts (import "server-only").
 */

export const WEEK_DAYS = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"] as const;

export const DAY_LABEL: Record<string, string> = {
  SENIN: "Senin",
  SELASA: "Selasa",
  RABU: "Rabu",
  KAMIS: "Kamis",
  JUMAT: "Jumat",
  SABTU: "Sabtu",
  MINGGU: "Minggu",
};

export type MissingPresensi = {
  halaqahId: string;
  halaqahName: string;
  halaqahCode: string;
  /** Tanggal jadwal yang lewat (YYYY-MM-DD). */
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string | null;
  /** Hari kalender menuju/tanggal tersebut (negatif = lampau). */
  daysOverdue: number;
  /** True bila tanggalnya hari ini tetapi jam mulai sudah terlewati. */
  isToday: boolean;
};

export type JadwalBoardData = {
  /** Jadwal semua hari (grouping di client). */
  schedules: import("@/lib/akademik").ScheduleRow[];
  /** Jadwal hari ini (kode hari). */
  todayCode: string;
  /** Tanggal hari ini (ISO, zona lokal). */
  todayISO: string;
  /** Tanggal-tanggal lewat yang belum dipresensi (terlama dulu). */
  missing: MissingPresensi[];
  /** Boleh mengelola jadwal (ADMIN only, sesuai RPC learning_schedule_save). */
  canManage: boolean;
};

/** Label tanggal Indonesia ringkas: "Sen, 21 Sep". */
export function formatTanggalSingkat(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(d);
}
