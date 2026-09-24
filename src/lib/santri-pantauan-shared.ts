import { fmtDMY } from "@/lib/date-format";
/**
import { fmtDMY } from "@/lib/date-format";
 * TAHFIZH V18 — Pantauan Santri (SHARED / client-safe).
 *
 * Tipe + label untuk menu pantauan di dasbor santri. Semua data berasal dari
 * penilaian guru lewat RPC `santri_*` (lihat migration V18) — tidak ada angka
 * yang dihitung ulang di klien selain persentase tampilan.
 */

export type ModuleKey =
  | "TAHFIDZ"
  | "SETORAN"
  | "TARTIL"
  | "HADITS"
  | "DOA"
  | "TAJWID"
  | "TUGAS";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  TAHFIDZ: "Hafalan Tahfidz",
  SETORAN: "Setoran",
  TARTIL: "Tartil (Mengaji)",
  HADITS: "Hadits",
  DOA: "Doa Harian",
  TAJWID: "Tajwid",
  TUGAS: "Tugas",
};

export const MODULE_TONES: Record<ModuleKey, string> = {
  TAHFIDZ: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  SETORAN: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  TARTIL: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  HADITS: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  DOA: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  TAJWID: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  TUGAS: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
};

/** Urutan tampilan kartu modul di Kartu Prestasi. */
export const MODULE_ORDER: ModuleKey[] = [
  "TAHFIDZ",
  "SETORAN",
  "TARTIL",
  "HADITS",
  "DOA",
  "TAJWID",
  "TUGAS",
];

export type ModuleStat = {
  count: number;
  avgScore: number | null;
  lastDate: string | null;
  lastTitle: string | null;
};

export const EMPTY_MODULE_STAT: ModuleStat = {
  count: 0,
  avgScore: null,
  lastDate: null,
  lastTitle: null,
};

export function moduleLabel(key: string) {
  return MODULE_LABELS[key as ModuleKey] ?? key;
}

export function moduleTone(key: string) {
  return MODULE_TONES[key as ModuleKey] ?? "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300";
}

export type PrestasiCard = {
  studentId: string;
  studentName: string;
  businessCode: string | null;
  halaqahName: string | null;
  surahSelesai: number;
  surahTotal: number;
  avgScore: number | null;
  totalPenilaian: number;
  penilaian30Hari: number;
  lastAssessedAt: string | null;
  modules: Record<string, number>;
  moduleStats: Record<string, ModuleStat>;
  presensi: { total: number; hadir: number; izin: number; sakit: number; alpa: number };
  catatanApresiasi: string | null;
};

export type PantauanItem = {
  studentId: string;
  studentName: string;
  module: string;
  title: string;
  detail: string | null;
  status: string | null;
  scoreLabel: string | null;
  scoreValue: number | null;
  freeNote: string | null;
  teacherName: string | null;
  assessedDate: string | null;
};

export type PresensiRekap = {
  studentId: string;
  studentName: string;
  summary: { total: number; hadir: number; izin: number; sakit: number; alpa: number };
  months: {
    ym: string;
    anchor: string;
    total: number;
    hadir: number;
    izin: number;
    sakit: number;
    alpa: number;
  }[];
  recent: { date: string; status: string; note: string | null; halaqahName: string | null }[];
};

export type TargetProgress = {
  studentId: string;
  studentName: string;
  halaqahName: string | null;
  targetId: string;
  category: string;
  targetValue: number;
  capaian: number;
  startDate: string;
  endDate: string;
  description: string | null;
  teacherName: string | null;
};

export type RaportItem = {
  reportId: string;
  studentId: string;
  studentName: string;
  title: string;
  academicYear: string;
  semesterLabel: string;
  periodLabel: string | null;
  periodStart: string;
  periodEnd: string;
  finalizedAt: string | null;
  teacherName: string | null;
};

/** Predikat dari rata-rata nilai angka (0 = belum ada nilai angka). */
export function predikat(avg: number | null): { label: string; tone: string } {
  if (avg === null || avg === undefined)
    return { label: "Belum ada nilai", tone: "bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300" };
  if (avg >= 90) return { label: "A — Mumtaz", tone: "bg-emerald-600 text-white" };
  if (avg >= 80) return { label: "B — Jayyid Jiddan", tone: "bg-sky-600 text-white" };
  if (avg >= 70) return { label: "C — Jayyid", tone: "bg-amber-500 text-white" };
  return { label: "D — Perlu Bimbingan", tone: "bg-rose-600 text-white" };
}

export type PrestasiBadge = { label: string; emoji: string; tone: string };

/**
 * Lencana kartu prestasi — murni turunan dari angka penilaian guru, tidak ada
 * penilaian baru yang dibuat di sisi santri.
 */
export function badgesFor(c: PrestasiCard): PrestasiBadge[] {
  const out: PrestasiBadge[] = [];
  const hadirPct = c.presensi.total > 0 ? (c.presensi.hadir / c.presensi.total) * 100 : 0;

  if (c.surahSelesai >= 10)
    out.push({ label: `${c.surahSelesai} surat dikuasai`, emoji: "📖", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" });
  if ((c.avgScore ?? 0) >= 90)
    out.push({ label: "Nilai Mumtaz", emoji: "🌟", tone: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" });
  if (c.presensi.total >= 8 && hadirPct >= 95)
    out.push({ label: "Kehadiran Teladan", emoji: "🎯", tone: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" });
  if (c.presensi.total >= 8 && c.presensi.alpa === 0)
    out.push({ label: "Tanpa Alpa", emoji: "✅", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" });
  if (c.penilaian30Hari >= 10)
    out.push({ label: "Rajin Setoran", emoji: "🔥", tone: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300" });
  if (Object.values(c.modules).filter((n) => n > 0).length >= 4)
    out.push({ label: "Aktif Semua Modul", emoji: "🧩", tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" });

  return out;
}

export function persen(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function tanggalId(iso: string | null | undefined) {
  return fmtDMY(iso);
}

export function bulanId(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

export const ATTENDANCE_TONES: Record<string, string> = {
  HADIR: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  IZIN: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  SAKIT: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  ALPA: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
