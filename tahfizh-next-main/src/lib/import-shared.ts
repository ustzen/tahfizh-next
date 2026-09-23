/**
 * TAHFIZH V12.14 — Import Excel Guru & Santri: definisi kolom + parser + validasi.
 *
 * Modul MURNI (tanpa "server-only", tanpa "use client", tanpa akses DB) yang
 * dipakai bersama oleh:
 *   - dialog import di browser (pratinjau + baca file), dan
 *   - server action `import-export.ts` (validasi ulang — server tidak pernah
 *     mempercayai client).
 * Satu sumber aturan → pratinjau di browser selalu sama dengan keputusan server.
 *
 * ---------------------------------------------------------------------------
 * AKAR MASALAH yang diperbaiki (import selalu gagal "Nama lengkap wajib 2-120
 * karakter" untuk SEMUA baris, termasuk file contoh bawaan aplikasi):
 *   Client dulu memakai baris 1 file sebagai nama properti lalu meng-UPPERCASE
 *   ("Nama Lengkap" → "NAMA LENGKAP"), sedangkan server mencari properti
 *   "C" / "Nama Lengkap" (huruf campuran) → tidak pernah cocok → semua kolom
 *   terbaca kosong. Sekarang header dipetakan lewat alias yang dinormalisasi
 *   (tidak peka huruf besar/kecil, spasi, titik, tanda kurung), dengan
 *   cadangan pemetaan berdasarkan URUTAN kolom A, B, C, …
 * ---------------------------------------------------------------------------
 */

export type ImportKind = "guru" | "santri";

/** Satu baris hasil parse: kunci kanonik "A".."J" + "__row" (nomor baris Excel). */
export type ImportRow = Record<string, string>;

export type ImportIssue = {
  /** Nomor baris di file Excel (header = baris 1). 0 = catatan umum. */
  row: number;
  reason: string;
  /** error = baris TIDAK diimport; warning = data tersimpan, ada catatan. */
  level: "error" | "warning";
};

export type ImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  /** Alias header yang sudah dinormalisasi (lihat normalizeHeader). */
  aliases: string[];
};

const GENDER_ALIASES = ["jeniskelamin", "jeniskelaminlp", "kelamin", "jk", "gender", "lp", "sex"];
const NICK_ALIASES = ["namapanggilan", "panggilan", "nickname"];
const HALAQAH_ALIASES = [
  "kodehalaqahkelas",
  "idhalaqahkelas",
  "kodehalaqah",
  "idhalaqah",
  "halaqah",
  "kelas",
  "halaqahcode",
  "namahalaqah",
  "namahalaqahkelas",
  "halaqahname",
];

export const TEACHER_IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: "A",
    label: "Tanda Pengenal (NIP/NBM/dst)",
    aliases: ["tandapengenal", "tandapengenalnipnbmdst", "tandapengenalnipnbm", "nip", "nbm", "identitas", "identity"],
  },
  { key: "B", label: "Nama Lengkap", required: true, aliases: ["namalengkap", "nama", "namaguru", "namaustadz", "fullname"] },
  { key: "C", label: "Nama Panggilan", aliases: NICK_ALIASES },
  { key: "D", label: "Gelar Depan", aliases: ["gelardepan", "gelarawal"] },
  { key: "E", label: "Gelar Belakang", aliases: ["gelarbelakang", "gelarakhir"] },
  { key: "F", label: "Jenis Kelamin (L/P)", required: true, aliases: GENDER_ALIASES },
  { key: "G", label: "Kode Halaqah/Kelas", aliases: HALAQAH_ALIASES },
  {
    key: "H",
    label: "No. WhatsApp",
    aliases: ["nowhatsapp", "nomorwhatsapp", "whatsapp", "nowa", "wa", "nohp", "nomorhp", "hp", "telepon"],
  },
  { key: "I", label: "Username Login", aliases: ["usernamelogin", "username", "namapengguna"] },
  { key: "J", label: "Kata Sandi", aliases: ["katasandi", "password", "sandi", "katakunci"] },
];

export const STUDENT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "A", label: "NIS", aliases: ["nis", "nomorinduk", "noinduk"] },
  { key: "B", label: "NISN", aliases: ["nisn"] },
  {
    key: "C",
    label: "Nama Lengkap",
    required: true,
    aliases: ["namalengkap", "nama", "namasantri", "namasiswa", "namapeserta", "fullname"],
  },
  { key: "D", label: "Nama Panggilan", aliases: NICK_ALIASES },
  { key: "E", label: "Jenis Kelamin (L/P)", required: true, aliases: GENDER_ALIASES },
  { key: "F", label: "Nama Wali", aliases: ["namawali", "wali", "namaorangtua", "namaortu", "orangtua", "guardianname"] },
  { key: "G", label: "Nama Halaqah/Kelas", aliases: HALAQAH_ALIASES },
  {
    key: "H",
    label: "No. WhatsApp Wali",
    aliases: [
      "nowhatsappwali",
      "nomorwhatsappwali",
      "whatsappwali",
      "nowawali",
      "wawali",
      "nohpwali",
      "nomorhpwali",
      "hpwali",
      "guardianwhatsapp",
      "nowhatsapp",
      "whatsapp",
      "nowa",
      "nohp",
    ],
  },
];

export function importColumnsFor(kind: ImportKind): ImportColumn[] {
  return kind === "guru" ? TEACHER_IMPORT_COLUMNS : STUDENT_IMPORT_COLUMNS;
}

/* -------------------------------------------------------------------------- */
/* Normalisasi header                                                          */
/* -------------------------------------------------------------------------- */

/**
 * "Nama Lengkap" / "NAMA  LENGKAP" / "C. Nama Lengkap" / "nama_lengkap"
 * → "namalengkap". Awalan urutan kolom ("A. ", "C) ", "B: ") dibuang; tanda
 * baca, spasi, dan garis bawah dihapus.
 */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .trim()
    .replace(/^[a-j]\s*[.):]\s*/, "")
    .replace(/^[a-j]\s+-\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Header → kunci kolom kanonik ("A".."J") atau null.
 * Juga menerima huruf kolom polos ("C") — format file lama / hasil export.
 */
export function resolveColumnKey(kind: ImportKind, header: unknown): string | null {
  const columns = importColumnsFor(kind);
  const text = String(header ?? "").trim();
  if (/^[A-Ja-j]$/.test(text)) {
    const k = text.toUpperCase();
    return columns.some((c) => c.key === k) ? k : null;
  }
  const norm = normalizeHeader(text);
  if (!norm) return null;
  for (const col of columns) {
    if (col.aliases.includes(norm)) return col.key;
  }
  return null;
}

/**
 * Validasi ulang di server: menerima objek dengan kunci apa pun (huruf kolom,
 * label header, nama field lama) → objek dengan kunci kanonik. Nilai dipaksa
 * menjadi string ber-trim; "__row" dipertahankan bila numerik.
 */
export function canonicalizeRow(kind: ImportKind, raw: unknown): ImportRow {
  const out: ImportRow = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "__row") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.__row = String(Math.trunc(n));
      continue;
    }
    const key = resolveColumnKey(kind, k);
    if (!key) continue;
    const value = cellToString(v);
    // Kunci pertama yang terisi menang (mis. "A" dan "nis" sekaligus).
    if (value !== "" && (out[key] === undefined || out[key] === "")) out[key] = value;
    else if (out[key] === undefined) out[key] = "";
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Baca matriks sheet → baris kanonik                                          */
/* -------------------------------------------------------------------------- */

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

/**
 * Excel membuang angka 0 di depan pada sel bertipe angka. Pulihkan untuk dua
 * kolom yang polanya pasti: NISN (10 digit) dan nomor WhatsApp Indonesia
 * (diawali 0 → Excel menyimpan 8xxxxxxxxxx).
 */
function restoreNumericCell(kind: ImportKind, key: string, n: number): string {
  const s = Number.isFinite(n) ? String(n) : "";
  if (!/^[0-9]+$/.test(s)) return s;
  if (kind === "santri" && key === "B" && s.length < 10) return s.padStart(10, "0");
  const isPhone = (kind === "guru" && key === "H") || (kind === "santri" && key === "H");
  if (isPhone && s.startsWith("8") && s.length >= 9 && s.length <= 13) return `0${s}`;
  return s;
}

export type ParsedSheet = {
  rows: ImportRow[];
  /** Nomor baris Excel tempat header ditemukan. */
  headerRow: number;
  /** Kolom yang berhasil dipetakan (untuk pratinjau). */
  mapped: { key: string; label: string; header: string }[];
  /** Header yang tidak dikenali dan diabaikan. */
  ignored: string[];
  /** true bila header tidak dikenali dan urutan kolom A, B, C… dipakai. */
  positional: boolean;
};

/**
 * @param matrix   hasil XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: "" })
 * @param firstRow nomor baris Excel dari matrix[0] (biasanya 1)
 */
export function parseSheetMatrix(kind: ImportKind, matrix: unknown[][], firstRow = 1): ParsedSheet {
  const columns = importColumnsFor(kind);
  const isEmptyRow = (r: unknown[]) => r.every((c) => cellToString(c) === "");

  // 1. Cari baris header: baris pertama (maks. 15 baris teratas) dengan ≥ 2
  //    header yang dikenali. Bila tidak ada → baris pertama yang berisi.
  let headerIdx = -1;
  let firstNonEmpty = -1;
  const scanLimit = Math.min(matrix.length, 15);
  for (let i = 0; i < scanLimit; i++) {
    const r = matrix[i] ?? [];
    if (isEmptyRow(r)) continue;
    if (firstNonEmpty < 0) firstNonEmpty = i;
    const keys = new Set<string>();
    for (const c of r) {
      const k = resolveColumnKey(kind, cellToString(c));
      if (k) keys.add(k);
    }
    if (keys.size >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) headerIdx = firstNonEmpty;
  if (headerIdx < 0) throw new Error("File tidak berisi data.");

  // 2. Petakan kolom.
  const headerCells = (matrix[headerIdx] ?? []).map(cellToString);
  const keyByCol: (string | null)[] = headerCells.map(() => null);
  const used = new Set<string>();
  headerCells.forEach((h, j) => {
    const k = resolveColumnKey(kind, h);
    if (k && !used.has(k)) {
      keyByCol[j] = k;
      used.add(k);
    }
  });
  // Header dikenali sebagian tetapi kolom WAJIB tidak ketemu (mis. "Nama Anak")
  // → coba urutan kolom A, B, C… sebelum menyerah.
  const requiredMissing = columns.some((c) => c.required && !used.has(c.key));
  const positional = used.size < 2 || requiredMissing;
  if (positional) {
    // Header tidak dikenali → pakai urutan kolom seperti yang dijanjikan
    // kotak "Format Penulisan Excel": A, B, C, …
    used.clear();
    headerCells.forEach((_, j) => {
      const col = columns[j];
      keyByCol[j] = col ? col.key : null;
      if (col) used.add(col.key);
    });
    // Kolom di luar jangkauan header (baris data lebih lebar) tetap dipetakan.
    let widest = 0;
    for (const r of matrix.slice(headerIdx + 1)) widest = Math.max(widest, r.length);
    for (let j = headerCells.length; j < Math.min(widest, columns.length); j++) {
      keyByCol[j] = columns[j].key;
      used.add(columns[j].key);
    }
  }

  for (const col of columns) {
    if (col.required && !used.has(col.key)) {
      throw new Error(
        `Kolom "${col.label}" tidak ditemukan pada header file. ` +
          `Gunakan judul kolom seperti pada contoh file, atau letakkan kolom tersebut sesuai urutan ` +
          `(${columns.map((c) => `${c.key}. ${c.label}`).join(" | ")}).`
      );
    }
  }

  const mapped: ParsedSheet["mapped"] = [];
  const ignored: string[] = [];
  keyByCol.forEach((k, j) => {
    const header = headerCells[j] ?? "";
    if (k) {
      const col = columns.find((c) => c.key === k)!;
      mapped.push({ key: k, label: col.label, header: header || `(kolom ${j + 1})` });
    } else if (header) {
      ignored.push(header);
    }
  });
  mapped.sort((a, b) => a.key.localeCompare(b.key));

  // 3. Baris data.
  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    if (isEmptyRow(r)) continue;
    const row: ImportRow = { __row: String(firstRow + i) };
    for (const col of columns) row[col.key] = "";
    keyByCol.forEach((k, j) => {
      if (!k) return;
      const v = r[j];
      row[k] = typeof v === "number" ? restoreNumericCell(kind, k, v) : cellToString(v);
    });
    rows.push(row);
  }

  return { rows, headerRow: firstRow + headerIdx, mapped, ignored, positional };
}

/* -------------------------------------------------------------------------- */
/* Validasi baris (dipakai client untuk pratinjau DAN server)                  */
/* -------------------------------------------------------------------------- */

export function cellValue(row: ImportRow, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? "" : String(v).trim();
}

const MALE = ["L", "LK", "M", "LAKI", "LAKILAKI", "LAKI-LAKI", "LAKI LAKI", "PRIA", "IKHWAN", "PUTRA", "MALE"];
const FEMALE = ["P", "PR", "F", "PEREMPUAN", "WANITA", "AKHWAT", "PUTRI", "FEMALE"];

export function parseGender(raw: string): "L" | "P" | null {
  const v = raw.trim().toUpperCase();
  if (MALE.includes(v)) return "L";
  if (FEMALE.includes(v)) return "P";
  return null;
}

/** "0812-3456 7890" → "081234567890" ("(+62)" & "+62" tetap valid). */
export function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

export type ValidTeacherRow = {
  rowNum: number;
  fullName: string;
  gender: "L" | "P";
  nickname: string | null;
  whatsapp: string | null;
  username: string;
  password: string;
  halaqahCode: string;
};

export type ValidStudentRow = {
  rowNum: number;
  fullName: string;
  gender: "L" | "P";
  nickname: string | null;
  nis: string | null;
  nisn: string | null;
  guardianName: string | null;
  guardianWhatsapp: string | null;
  /**
   * V14 — NAMA halaqah persis seperti tertulis di file (huruf besar/kecil
   * dipertahankan untuk ditampilkan di laporan), dicocokkan ke halaqah
   * lembaga TANPA memandang besar/kecil huruf (mis. "Alif" = "ALIF" = "alif").
   */
  halaqahName: string;
};

type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

export function rowNumberOf(row: ImportRow, fallbackIndex: number): number {
  const n = Number(row.__row);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallbackIndex + 2;
}

export function validateTeacherRow(row: ImportRow, rowNum: number): Checked<ValidTeacherRow> {
  const fullName = cellValue(row, "B");
  const nickname = cellValue(row, "C");
  const genderRaw = cellValue(row, "F");
  const whatsapp = cleanPhone(cellValue(row, "H"));
  const username = cellValue(row, "I").toLowerCase();
  const password = cellValue(row, "J");
  const halaqahCode = cellValue(row, "G").toUpperCase();

  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, reason: "Nama lengkap wajib 2-120 karakter" };
  }
  const gender = parseGender(genderRaw);
  if (!gender) {
    return { ok: false, reason: `Jenis kelamin tidak valid: "${genderRaw}" (isi L atau P)` };
  }
  if (whatsapp && !/^\+?[0-9]{8,15}$/.test(whatsapp)) {
    return { ok: false, reason: `Nomor WhatsApp tidak valid: ${whatsapp}` };
  }
  if (nickname.length > 60) {
    return { ok: false, reason: "Nama panggilan maksimal 60 karakter" };
  }
  if (username && !/^[a-z0-9._-]{4,30}$/.test(username)) {
    return { ok: false, reason: `Username tidak valid: ${username} (4-30, huruf kecil/angka/. _ -)` };
  }
  if (password && password.length < 8) {
    return { ok: false, reason: "Kata sandi minimal 8 karakter" };
  }
  return {
    ok: true,
    value: {
      rowNum,
      fullName,
      gender,
      nickname: nickname || null,
      whatsapp: whatsapp || null,
      username,
      password,
      halaqahCode,
    },
  };
}

export function validateStudentRow(row: ImportRow, rowNum: number): Checked<ValidStudentRow> {
  const nis = cellValue(row, "A");
  const nisn = cellValue(row, "B").replace(/\D/g, "");
  const fullName = cellValue(row, "C");
  const nickname = cellValue(row, "D");
  const genderRaw = cellValue(row, "E");
  const guardianName = cellValue(row, "F").slice(0, 120);
  // V14 — nama halaqah dipertahankan apa adanya (peka huruf besar/kecil TIDAK
  // berlaku): pencocokan ke halaqah lembaga dilakukan case-insensitive di
  // server (lihat resolveHalaqahByName di actions/import-export.ts).
  const halaqahName = cellValue(row, "G").trim().slice(0, 120);
  const guardianWa = cleanPhone(cellValue(row, "H"));

  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, reason: "Nama lengkap wajib 2-120 karakter" };
  }
  const gender = parseGender(genderRaw);
  if (!gender) {
    return { ok: false, reason: `Jenis kelamin tidak valid: "${genderRaw}" (isi L atau P)` };
  }
  if (nis.length > 30) {
    return { ok: false, reason: `NIS maksimal 30 karakter: ${nis}` };
  }
  if (nisn && !/^[0-9]{10}$/.test(nisn)) {
    return {
      ok: false,
      reason:
        nisn.length < 10
          ? `NISN harus 10 digit: ${nisn} (bila diawali 0, format kolom NISN sebagai Teks di Excel)`
          : `NISN harus 10 digit: ${nisn}`,
    };
  }
  if (guardianWa && !/^\+?[0-9]{8,15}$/.test(guardianWa)) {
    return { ok: false, reason: `No. WhatsApp wali tidak valid: ${guardianWa}` };
  }
  if (nickname.length > 60) {
    return { ok: false, reason: "Nama panggilan maksimal 60 karakter" };
  }
  return {
    ok: true,
    value: {
      rowNum,
      fullName,
      gender,
      nickname: nickname || null,
      nis: nis || null,
      nisn: nisn || null,
      guardianName: guardianName || null,
      guardianWhatsapp: guardianWa || null,
      halaqahName,
    },
  };
}

/** Pratinjau client: validasi seluruh baris tanpa DB (duplikat dalam file ikut dicek). */
export function previewValidate(kind: ImportKind, rows: ImportRow[]): { valid: number; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  let valid = 0;
  const seen = {
    nis: new Map<string, number>(),
    nisn: new Map<string, number>(),
    username: new Map<string, number>(),
  };
  rows.forEach((row, i) => {
    const rowNum = rowNumberOf(row, i);
    if (kind === "guru") {
      const r = validateTeacherRow(row, rowNum);
      if (!r.ok) return void issues.push({ row: rowNum, reason: r.reason, level: "error" });
      const u = r.value.username;
      if (u) {
        const dup = seen.username.get(u);
        if (dup) return void issues.push({ row: rowNum, reason: `Username "${u}" duplikat dengan baris ${dup}`, level: "error" });
        seen.username.set(u, rowNum);
      }
      valid++;
    } else {
      const r = validateStudentRow(row, rowNum);
      if (!r.ok) return void issues.push({ row: rowNum, reason: r.reason, level: "error" });
      const { nis, nisn } = r.value;
      if (nis) {
        const dup = seen.nis.get(nis);
        if (dup) return void issues.push({ row: rowNum, reason: `NIS "${nis}" duplikat dengan baris ${dup}`, level: "error" });
        seen.nis.set(nis, rowNum);
      }
      if (nisn) {
        const dup = seen.nisn.get(nisn);
        if (dup) return void issues.push({ row: rowNum, reason: `NISN "${nisn}" duplikat dengan baris ${dup}`, level: "error" });
        seen.nisn.set(nisn, rowNum);
      }
      valid++;
    }
  });
  return { valid, issues };
}

/* -------------------------------------------------------------------------- */
/* Pesan error database yang ramah                                             */
/* -------------------------------------------------------------------------- */

export type DbErrorLike = { message?: string; code?: string; details?: string | null; hint?: string | null };

/** Error yang berlaku untuk SEMUA baris (skema/kebijakan) — tak ada gunanya dicoba ulang per baris. */
export function isSystemicDbError(err: DbErrorLike): boolean {
  const code = err.code ?? "";
  const msg = err.message ?? "";
  return (
    ["PGRST204", "PGRST205", "42703", "42P01", "42501"].includes(code) ||
    /row-level security|schema cache|does not exist/i.test(msg)
  );
}

export function friendlyDbError(err: DbErrorLike, table: "teachers" | "students"): string {
  const code = err.code ?? "";
  const msg = err.message ?? "kesalahan tidak diketahui";
  const blob = `${msg} ${err.details ?? ""}`;

  const colMatch = msg.match(/'([a-z_]+)' column/i) ?? msg.match(/column "?([a-z_.]+)"? (?:of relation|does not exist)/i);
  if (code === "PGRST204" || code === "42703" || colMatch) {
    return (
      `Kolom database belum tersedia${colMatch ? ` ("${colMatch[1]}")` : ""} pada tabel ${table}. ` +
      `Jalankan migration terbaru di Supabase (supabase/tahfizh-combined.sql atau folder supabase/migrations), lalu coba lagi.`
    );
  }
  if (code === "42P01" || code === "PGRST205") {
    return `Tabel ${table} tidak ditemukan di database — jalankan migration di Supabase.`;
  }
  if (code === "42501" || /row-level security/i.test(msg)) {
    return (
      "Ditolak oleh kebijakan keamanan database (RLS). Pastikan akun Anda ADMIN/KOORDINATOR lembaga ini " +
      "dan migration terbaru sudah dijalankan."
    );
  }
  if (code === "23505") {
    if (/nisn/i.test(blob)) return "NISN sudah dipakai santri lain di lembaga ini";
    if (/nis/i.test(blob)) return "NIS sudah dipakai santri lain di lembaga ini";
    if (/login_username|username/i.test(blob)) return "Username sudah dipakai";
    return "Data duplikat — sudah ada di database";
  }
  if (code === "23514") {
    if (/nisn/i.test(blob)) return "NISN harus 10 digit angka";
    if (/whatsapp/i.test(blob)) return "Nomor WhatsApp tidak valid (8-15 digit)";
    if (/nis/i.test(blob)) return "NIS maksimal 30 karakter";
    return `Data melanggar aturan database: ${msg}`;
  }
  if (code === "22P02") return `Format data tidak valid: ${msg}`;
  return msg;
}
