/**
 * TAHFIZH V78 — Kriteria peringkat & skala nilai huruf per guru.
 * File ini aman dipakai di server maupun client (tanpa import server-only).
 */

export const RANK_MODULES = [
  { key: "TAHFIDZ", label: "Tahfidz", hint: "Hafalan surat" },
  { key: "TARTIL", label: "Tartil", hint: "Jilid & halaman" },
  { key: "HADITS", label: "Hadits", hint: "Hafalan hadits" },
  { key: "DOA", label: "Doa Harian", hint: "Hafalan doa" },
  { key: "TAJWID", label: "Tajwid", hint: "Materi tajwid" },
  { key: "TUGAS", label: "Tugas Halaqah", hint: "Tugas dari guru" },
  { key: "SETORAN", label: "Setoran", hint: "Setoran hafalan" },
  { key: "ABSENSI", label: "Absensi", hint: "Persentase hadir" },
] as const;

export type RankModuleKey = (typeof RANK_MODULES)[number]["key"];

/** Default = semua modul nilai, tanpa absensi (sama dengan perilaku sebelumnya). */
export const DEFAULT_RANK_MODULES: RankModuleKey[] = [
  "TAHFIDZ",
  "TARTIL",
  "HADITS",
  "DOA",
  "TAJWID",
  "TUGAS",
  "SETORAN",
];

export function rankModuleLabel(key: string): string {
  return RANK_MODULES.find((m) => m.key === key)?.label ?? key;
}

export type GradeBand = { label: string; min: number; max: number };

/** Skala huruf standar — guru bebas mengubahnya. */
export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { label: "A+", min: 96, max: 100 },
  { label: "A", min: 91, max: 95 },
  { label: "A-", min: 86, max: 90 },
  { label: "B+", min: 81, max: 85 },
  { label: "B", min: 76, max: 80 },
  { label: "B-", min: 71, max: 75 },
  { label: "C+", min: 66, max: 70 },
  { label: "C", min: 61, max: 65 },
  { label: "C-", min: 56, max: 60 },
  { label: "D", min: 0, max: 55 },
];

export type TeacherRankSettings = {
  modules: RankModuleKey[];
  scale: GradeBand[];
  /** true bila guru sudah pernah menyimpan pilihan modul sendiri. */
  customModules: boolean;
  /** true bila guru sudah pernah menyimpan skala huruf sendiri. */
  customScale: boolean;
};

/** Cari huruf untuk sebuah skor; null bila skor kosong / tidak masuk rentang mana pun. */
export function gradeFor(score: number | null | undefined, scale: GradeBand[]): string | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const hit = scale.find((g) => score >= g.min && score <= g.max);
  return hit ? hit.label : null;
}

/**
 * Validasi skala huruf (dipakai di client & server).
 * Mengembalikan pesan error, atau null bila valid.
 */
export function validateGradeScale(rows: GradeBand[]): string | null {
  if (rows.length === 0) return "Minimal harus ada 1 nilai huruf.";
  if (rows.length > 20) return "Maksimal 20 nilai huruf.";

  const seen = new Set<string>();
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) return "Nama nilai (mis. A+) tidak boleh kosong.";
    if (label.length > 10) return `Nama nilai "${label}" maksimal 10 karakter.`;
    if (seen.has(label.toLowerCase())) return `Nama nilai "${label}" dipakai dua kali.`;
    seen.add(label.toLowerCase());
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) {
      return `Rentang nilai "${label}" harus berupa angka bulat.`;
    }
    if (r.min < 0 || r.max > 100) return `Rentang "${label}" harus di antara 0 dan 100.`;
    if (r.min > r.max) return `Pada "${label}", nilai awal tidak boleh lebih besar dari nilai akhir.`;
  }

  const sorted = [...rows].sort((a, b) => a.min - b.min || a.max - b.max);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) {
      return `Rentang "${sorted[i - 1].label.trim()}" dan "${sorted[i].label.trim()}" saling tumpang tindih.`;
    }
  }
  return null;
}

/** Peringatan (bukan error): bagian 0–100 yang belum punya huruf. */
export function scaleGapWarning(rows: GradeBand[]): string | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.min - b.min);
  const gaps: string[] = [];
  if (sorted[0].min > 0) gaps.push(`0–${sorted[0].min - 1}`);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min - sorted[i - 1].max > 1) {
      gaps.push(`${sorted[i - 1].max + 1}–${sorted[i].min - 1}`);
    }
  }
  const top = sorted[sorted.length - 1].max;
  if (top < 100) gaps.push(`${top + 1}–100`);
  return gaps.length > 0 ? `Nilai ${gaps.join(", ")} belum punya huruf.` : null;
}
