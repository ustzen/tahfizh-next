/**
 * Riwayat nilai Tartil untuk role santri/wali — tipe + helper client-safe
 * (tanpa import server). Query server ada di santri-tartil-riwayat.ts.
 */

export type TartilRiwayatItem = {
  id: string;
  studentId: string;
  /** ISO timestamp penilaian. */
  assessedAt: string;
  materialName: string;
  jilid: string | null;
  /** Label halaman apa adanya: "5" atau "3-5". */
  pagesLabel: string | null;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreValue: number | null;
  scoreLabel: string | null;
  teacherName: string | null;
  catatan: string | null;
};

export type TartilRiwayatRow = {
  r_student_id: string;
  r_id: string;
  r_assessed_at: string;
  r_material: string;
  r_jilid: string | null;
  r_pages: string | null;
  r_status: string;
  r_score_value: number | string | null;
  r_score_label: string | null;
  r_teacher: string | null;
  r_catatan: string | null;
};

export function mapTartilRiwayat(r: TartilRiwayatRow): TartilRiwayatItem {
  const status = r.r_status === "DINILAI" || r.r_status === "DIPELAJARI" ? r.r_status : "BELUM";
  const sv = r.r_score_value === null || r.r_score_value === undefined ? null : Number(r.r_score_value);
  return {
    id: r.r_id,
    studentId: r.r_student_id,
    assessedAt: r.r_assessed_at,
    materialName: r.r_material,
    jilid: r.r_jilid,
    pagesLabel: r.r_pages,
    status,
    scoreValue: sv !== null && Number.isFinite(sv) ? sv : null,
    scoreLabel: r.r_score_label,
    teacherName: r.r_teacher,
    catatan: r.r_catatan,
  };
}

/** Teks nilai: huruf (mode Huruf) → angka (mode Angka) → ✓ (mode Centang). */
export function nilaiText(i: TartilRiwayatItem): string {
  if (i.status === "DIPELAJARI") return "Dipelajari";
  if (i.status !== "DINILAI") return "Belum";
  if (i.scoreLabel) return i.scoreLabel;
  if (i.scoreValue !== null) return i.scoreValue.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return "✓";
}

/** Predikat dari nilai angka (sama dengan pita predikat Kartu Prestasi). */
export function nilaiPredikat(v: number | null): string | null {
  if (v === null) return null;
  if (v >= 90) return "Sangat Baik";
  if (v >= 75) return "Baik";
  if (v >= 60) return "Cukup";
  return "Perlu Ulang";
}

/** Kelas warna pil nilai. */
export function nilaiTone(i: TartilRiwayatItem): string {
  if (i.status !== "DINILAI") return "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300";
  if (i.scoreValue === null) return "bg-emerald-600 text-white";
  if (i.scoreValue >= 90) return "bg-emerald-700 text-white";
  if (i.scoreValue >= 75) return "bg-teal-700 text-white";
  return "bg-amber-200 text-amber-900";
}
