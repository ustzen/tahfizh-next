/**
 * TAHFIZH V9 — client-safe report constants (no server imports).
 * Server data access lives in src/lib/report.ts (import "server-only").
 */

/** Canvas = A4 @96dpi portrait. Landscape swaps w/h. */
export const CANVAS = {
  A4: { w: 794, h: 1123 },
  A5: { w: 559, h: 794 },
  LETTER: { w: 816, h: 1056 },
} as const;

export type PaperSize = keyof typeof CANVAS;

export function canvasSize(paper: string, orientation: string) {
  const base = CANVAS[(paper as PaperSize) in CANVAS ? (paper as PaperSize) : "A4"];
  return orientation === "LANDSCAPE" ? { w: base.h, h: base.w } : base;
}

export const GRID = 8; // snap grid (rule #10)

/** Snap a value to the 8px grid (keeps layout tidy without pixel fiddling). */
export function snap(v: number): number {
  return Math.max(0, Math.round(v / GRID) * GRID);
}

export const REPORT_COMPONENT_TYPES = [
  "LOGO",
  "SECTION_HEADING",
  "DIVIDER",
  "BOX",
  "STUDENT_PHOTO",
  "GRADE_LEGEND",
  "INSTITUTION_NAME",
  "INSTITUTION_ADDRESS",
  "INSTITUTION_CONTACT",
  "REPORT_TITLE",
  "PERIOD",
  "ACADEMIC_YEAR",
  "SEMESTER",
  "STUDENT_IDENTITY",
  "TEACHER_IDENTITY",
  "HEAD_IDENTITY",
  "SCORE_TABLE",
  "ACHIEVEMENT_SUMMARY",
  "ATTENDANCE",
  "NOTES",
  "CUSTOM_TEXT",
  "SIGNATURES",
  "FOOTER",
] as const;
export type ReportComponentType = (typeof REPORT_COMPONENT_TYPES)[number];

export const COMPONENT_META: Record<
  string,
  { label: string; group: "Identitas" | "Nilai" | "Lainnya"; w: number; h: number }
> = {
  LOGO: { label: "Logo", group: "Identitas", w: 96, h: 96 },
  SECTION_HEADING: { label: "Judul Bagian", group: "Lainnya", w: 340, h: 28 },
  DIVIDER: { label: "Garis Pemisah", group: "Lainnya", w: 714, h: 8 },
  BOX: { label: "Panel / Kotak", group: "Lainnya", w: 340, h: 160 },
  STUDENT_PHOTO: { label: "Foto Santri", group: "Identitas", w: 96, h: 128 },
  GRADE_LEGEND: { label: "Keterangan Predikat", group: "Nilai", w: 340, h: 116 },
  INSTITUTION_NAME: { label: "Nama Lembaga", group: "Identitas", w: 400, h: 36 },
  INSTITUTION_ADDRESS: { label: "Alamat", group: "Identitas", w: 400, h: 28 },
  INSTITUTION_CONTACT: { label: "Kontak", group: "Identitas", w: 400, h: 24 },
  REPORT_TITLE: { label: "Judul Raport", group: "Identitas", w: 698, h: 44 },
  PERIOD: { label: "Periode", group: "Identitas", w: 698, h: 26 },
  ACADEMIC_YEAR: { label: "Tahun Ajaran", group: "Identitas", w: 698, h: 26 },
  SEMESTER: { label: "Semester", group: "Identitas", w: 698, h: 26 },
  STUDENT_IDENTITY: { label: "Identitas Santri", group: "Identitas", w: 340, h: 104 },
  TEACHER_IDENTITY: { label: "Identitas Guru", group: "Identitas", w: 330, h: 88 },
  HEAD_IDENTITY: { label: "Kepala Lembaga", group: "Identitas", w: 330, h: 72 },
  SCORE_TABLE: { label: "Tabel Nilai", group: "Nilai", w: 698, h: 260 },
  ACHIEVEMENT_SUMMARY: { label: "Kartu Prestasi Ringkas", group: "Nilai", w: 330, h: 160 },
  ATTENDANCE: { label: "Presensi (V8)", group: "Nilai", w: 336, h: 108 },
  NOTES: { label: "Catatan", group: "Lainnya", w: 698, h: 120 },
  CUSTOM_TEXT: { label: "Teks Bebas", group: "Lainnya", w: 400, h: 32 },
  SIGNATURES: { label: "Tanda Tangan", group: "Lainnya", w: 698, h: 140 },
  FOOTER: { label: "Footer", group: "Lainnya", w: 698, h: 32 },
};

export type ReportStyle = {
  fontSize?: number;
  /** Warna teks (hex/rgb). Dipakai judul bagian & aksen template. */
  color?: string | null;
  /** Warna garis/bingkai untuk DIVIDER, BOX, dan panel berbingkai. */
  borderColor?: string | null;
  /** Sudut membulat (px) untuk BOX/panel. */
  radius?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  background?: string | null;
  opacity?: number;
};

export type ReportComponent = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked: boolean;
  hidden: boolean;
  style: ReportStyle;
  props: Record<string, unknown>;
};

export type ReportPage = { components: ReportComponent[] };

export type ReportLayout = {
  pages: ReportPage[];
};

export type ReportSettingsDto = {
  logoPath: string | null;
  address: string;
  contact: string;
  footerText: string;
  showPageNumbers: boolean;
  watermarkEnabled: boolean;
  watermarkOpacity: number;
  watermarkScale: number;
  watermarkPath: string | null;
};

/** Data payload shape from report_student_data RPC (subset used by renderer). */
export type ReportData = {
  student?: { name?: string; id?: string; gender?: string };
  teacher?: { name?: string; id?: string; identityLabel?: string } | null;
  head?: { name?: string; id?: string; identityLabel?: string } | null;
  institution?: {
    name?: string;
    code?: string;
    address?: string;
    contact?: string;
    logoPath?: string | null;
    watermark?: { enabled?: boolean; opacity?: number; scale?: number; path?: string | null };
    footer?: string;
    showPageNumbers?: boolean;
  };
  mode?: string;
  scores?: {
    tahfidz?: { count?: number; avgValue?: number | null; lastLabel?: string | null; activeTotal?: number; rows?: { name: string; scoreLabel: string | null; scoreValue: number | null; status: string }[] };
    tartil?: { count?: number; avgValue?: number | null; lastLabel?: string | null; lastPages?: string | null };
    setoran?: { total?: number; lulus?: number; ulang?: number; lastKind?: string | null };
    hadits?: { count?: number; total?: number; avgValue?: number | null; lastLabel?: string | null };
    doa?: { count?: number; total?: number; avgValue?: number | null; lastLabel?: string | null };
    tajwid?: { count?: number; total?: number; avgValue?: number | null; lastLabel?: string | null };
    target?: { active?: number; avgProgress?: number };
    tugas?: { total?: number; dinilai?: number; avgValue?: number | null };
    jurnal?: number;
  };
  attendance?: { hadir?: number; izin?: number; sakit?: number; alpa?: number; persen?: number } | null;
  period?: { start?: string; end?: string };
};

export const MODULE_LABELS: Record<string, string> = {
  TAHFIDZ: "Tahfidz",
  TARTIL: "Tartil",
  SETORAN: "Setoran",
  HADITS: "Hadits",
  DOA: "Doa Harian",
  TAJWID: "Tajwid",
  TARGET: "Target",
  TUGAS: "Tugas",
};

/** Watermark opacity defaults (rule #22). */
export const WATERMARK_OPACITY_OPTIONS = [10, 15, 20, 25, 30] as const;

let seq = 0;
export function newComponentId(): string {
  seq += 1;
  return `c-${Date.now().toString(36)}-${seq}`;
}

/* ------------------------------------------------------------------------ */
/* V13 — Data contoh untuk galeri raport                                     */
/* ------------------------------------------------------------------------ */
/**
 * Dipakai HANYA untuk pratinjau template di galeri & halaman "Lihat Contoh".
 * Tidak pernah disimpan dan tidak pernah menimpa data santri asli — raport
 * sungguhan selalu memakai hasil RPC report_student_data.
 */
export const SAMPLE_REPORT_DATA: ReportData = {
  student: { name: "Ahmad Fauzan Hakim", id: "STR-0142", gender: "L" },
  teacher: { name: "Ustadz Abdul Latif, S.Pd.I", id: "GR-017", identityLabel: "NIP" },
  head: { name: "KH. Muhammad Ridwan", id: "KL-001", identityLabel: "NIP" },
  institution: {
    name: "Rumah Tahfizh Al-Hikmah",
    code: "ALHIKMAH",
    address: "Jl. Merdeka No. 45, Purwokerto, Banyumas 53114",
    contact: "0281-123456 • info@alhikmah.sch.id",
    footer: "Dokumen ini dicetak melalui aplikasi TAHFIZH.",
    showPageNumbers: true,
  },
  mode: "ANGKA",
  scores: {
    tahfidz: { count: 18, avgValue: 88, lastLabel: "An-Naba'", activeTotal: 37 },
    tartil: { count: 24, avgValue: 85, lastLabel: "Baik", lastPages: "Jilid 5 hal. 22" },
    setoran: { total: 96, lulus: 88, ulang: 8, lastKind: "TAHFIDZ" },
    hadits: { count: 12, total: 15, avgValue: 90, lastLabel: "Hadits Niat" },
    doa: { count: 14, total: 18, avgValue: 92, lastLabel: "Doa Masuk Masjid" },
    tajwid: { count: 9, total: 12, avgValue: 86, lastLabel: "Mad Thabi'i" },
    target: { active: 3, avgProgress: 76 },
    tugas: { total: 10, dinilai: 9, avgValue: 87 },
    jurnal: 21,
  },
  attendance: { hadir: 68, izin: 3, sakit: 2, alpa: 1, persen: 92 },
  period: { start: "2026-07-01", end: "2026-12-31" },
};

/** Konteks contoh (judul, tahun ajaran, periode) untuk pratinjau template. */
export const SAMPLE_REPORT_CTX = {
  title: "RAPORT PERKEMBANGAN TAHFIZH",
  academicYear: "2026/2027",
  semesterLabel: "Semester 1 (Ganjil)",
  periodLabel: null as string | null,
  periodStart: "2026-07-01",
  periodEnd: "2026-12-31",
};

/** Predikat default untuk komponen GRADE_LEGEND. */
export const DEFAULT_GRADE_LEGEND: { range: string; label: string }[] = [
  { range: "90 - 100", label: "Mumtaz (Istimewa)" },
  { range: "80 - 89", label: "Jayyid Jiddan (Baik Sekali)" },
  { range: "70 - 79", label: "Jayyid (Baik)" },
  { range: "< 70", label: "Maqbul (Cukup)" },
];

/** Layout kosong yang valid — dipakai saat membuat template baru. */
export const EMPTY_LAYOUT: ReportLayout = { pages: [{ components: [] }] };

/** Ambil hanya halaman pertama (dipakai thumbnail galeri). */
export function firstPageOnly(layout: ReportLayout): ReportLayout {
  return { pages: layout.pages.length > 0 ? [layout.pages[0]] : [{ components: [] }] };
}
