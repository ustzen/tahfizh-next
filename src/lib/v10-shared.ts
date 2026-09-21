/**
 * TAHFIZH V10 — shared constants & formatters (CLIENT SAFE).
 *
 * Pure helpers needed by both server components and client components.
 * Server-only data access lives in v10.ts; server actions in app/actions/v10.ts.
 */

/* ------------------------------------------------------------------------ */
/* Infak Pengembangan — terminology (rule #4: never call it subscription)   */
/* ------------------------------------------------------------------------ */

export const INFAK_MIN_AMOUNT = 1000; // rule #3: minimal Rp1.000
export const IPAYMU_MIN_TOTAL = 10000; // rule #13: otomatis hanya ≥ Rp10.000
export const DUE_DAY = 15; // batas pembayaran maksimal tanggal 15 (tagihan muncul tanggal 1)
export const LOCK_DAY = 16; // rule #7: pembatasan mulai tanggal 16

export const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000]; // rule #103
export const ADVANCE_MONTHS_MAX = 11; // bayar di muka: sampai 11 bulan ke depan (di luar bulan berjalan)
export const MAX_PAYMENT_ITEMS = 120; // batas tagihan (santri × bulan) dalam satu pembayaran

/* ------------------------------------------------------------------------ */
/* Labels                                                                   */
/* ------------------------------------------------------------------------ */

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  UNPAID: "Belum Bayar",
  PENDING: "Menunggu Pembayaran",
  WAITING_CONFIRM: "Menunggu Konfirmasi",
  PAID: "Lunas",
};

export const TRANSACTION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Pembayaran",
  WAITING_CONFIRM: "Menunggu Konfirmasi",
  PAID: "Lunas",
  REJECTED: "Ditolak",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  MANUAL: "Transfer Manual",
  IPAYMU: "Otomatis (iPaymu)",
  OFFLINE: "Pelunasan Dicatat Developer",
};

/** Batas santri yang boleh dilunasi Developer dalam satu kali proses. */
export const MAX_SETTLE_ITEMS = 300;

/** Pilihan cepat nama pembayar saat infak ingin disamarkan. */
export const ANONYMOUS_PAYER_NAME = "Hamba Allah";

export const FEEDBACK_CATEGORY_LABEL: Record<string, string> = {
  KRITIK: "Kritik",
  SARAN: "Saran",
  LAPORAN_ERROR: "Laporan Error",
  PERMINTAAN_FITUR: "Permintaan Fitur",
  PENGEMBANGAN: "Infak Pengembangan",
  LAINNYA: "Lainnya",
};

export const FEEDBACK_TARGET_LABEL: Record<string, string> = {
  USTADZ: "Ustadz/Ustadzah",
  KOORDINATOR: "Koordinator",
  ADMIN: "Admin",
  LEMBAGA: "Lembaga",
  DEVELOPER: "Developer",
};

export const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  BARU: "Baru",
  DIBACA: "Dibaca",
  DIPROSES: "Diproses",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
};

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  PAYMENT_SUBMITTED: "Pembayaran",
  PAYMENT_CONFIRMED: "Pembayaran",
  PAYMENT_REJECTED: "Pembayaran",
  FEEDBACK_NEW: "Kritik & Saran",
  INFO: "Info",
};

/** Badge tone class per status (Tailwind, dark-mode aware). */
export function statusTone(status: string): string {
  switch (status) {
    case "PAID":
    case "SELESAI":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "WAITING_CONFIRM":
    case "DIPROSES":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "PENDING":
    case "BARU":
    case "DIBACA":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
    case "REJECTED":
    case "DITOLAK":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400";
  }
}

/* ------------------------------------------------------------------------ */
/* Formatters                                                               */
/* ------------------------------------------------------------------------ */

/** Indonesian Rupiah formatting, e.g. Rp1.000 / Rp25.000. */
export function rupiah(n: number | null | undefined): string {
  return "Rp" + Math.round(Number(n ?? 0)).toLocaleString("id-ID");
}

export const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function monthLabel(m: number): string {
  return MONTH_NAMES[Math.min(12, Math.max(1, m)) - 1] ?? String(m);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "Juli 2026" */
export function monthYearLabel(y: number, m: number): string {
  return `${monthLabel(m)} ${y}`;
}

/** "Jul 2026" (ringkas, untuk chip). */
export function monthYearShort(y: number, m: number): string {
  return `${MONTH_SHORT[Math.min(12, Math.max(1, m)) - 1]} ${y}`;
}

/** Indeks bulan berurutan (untuk membandingkan / mengurutkan y+m). */
export function monthIndex(y: number, m: number): number {
  return y * 12 + m;
}

/**
 * Tanggal Indonesia tetap zona Asia/Jakarta, mis. "20 September 2026".
 * timeZone eksplisit agar server & browser menampilkan hari yang sama.
 */
export function formatDateId(iso: string | null | undefined, opts?: { short?: boolean }): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: opts?.short ? "short" : "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Kelompokkan alokasi transaksi per santri → "Jul, Agu, Sep 2026; Jan 2027".
 * Dipakai riwayat transaksi supaya pembayaran banyak bulan tetap ringkas.
 */
export function groupAllocationsByStudent(
  allocations: { student: string; y: number; m: number }[]
): { student: string; months: string }[] {
  const byStudent = new Map<string, Map<number, number[]>>();
  for (const a of allocations) {
    const years = byStudent.get(a.student) ?? new Map<number, number[]>();
    const months = years.get(a.y) ?? [];
    months.push(a.m);
    years.set(a.y, months);
    byStudent.set(a.student, years);
  }
  return [...byStudent.entries()].map(([student, years]) => ({
    student,
    months: [...years.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([y, ms]) => `${ms.sort((a, b) => a - b).map((m) => MONTH_SHORT[m - 1]).join(", ")} ${y}`)
      .join("; "),
  }));
}

/**
 * Keterangan riwayat per bulan, mis.
 * "Dibayarkan tanggal 20 September 2026 · dibayar di muka · sekaligus 3 bulan · oleh Ahmad".
 */
export function paidNote(p: {
  paidAt: string | null;
  paidByName: string | null;
  paidBySelf: boolean;
  bundleMonths: number | null;
  paidInAdvance?: boolean;
  paidVia?: string | null;
}): string {
  const parts: string[] = [];
  const date = formatDateId(p.paidAt);
  parts.push(date ? `Dibayarkan tanggal ${date}` : "Sudah dibayarkan");
  if (p.paidInAdvance) parts.push("dibayar di muka");
  if ((p.bundleMonths ?? 0) > 1) parts.push(`sekaligus ${p.bundleMonths} bulan`);
  if (p.paidBySelf) parts.push("dibayar sendiri");
  else if (p.paidByName) parts.push(`oleh ${p.paidByName}`);
  if (p.paidVia === "OFFLINE") parts.push("dicatat pengelola platform");
  return parts.join(" · ");
}

/** Error message map — DB RPC raises concise codes; UI shows friendly text. */
export const DB_ERROR_MESSAGE: Record<string, string> = {
  AKSES_DITOLAK: "Akses ditolak.",
  METODE_TIDAK_VALID: "Metode pembayaran tidak valid.",
  ITEM_KOSONG: "Pilih minimal satu tagihan.",
  ITEM_TIDAK_VALID: "Data tagihan tidak valid.",
  ITEM_GANDA: "Ada tagihan yang terpilih dua kali. Muat ulang halaman lalu coba lagi.",
  ITEM_TERLALU_BANYAK: "Terlalu banyak tagihan dalam satu pembayaran (maksimal 120). Bayar bertahap.",
  BULAN_DI_LUAR_BATAS: "Pembayaran di muka maksimal 11 bulan ke depan dari bulan ini.",
  NOMINAL_MINIMAL: "Nominal minimal Rp1.000.",
  NOMINAL_KURANG: "Nominal tidak boleh kurang dari nilai tagihan bulan tersebut.",
  SANTRI_TIDAK_DITEMUKAN: "Santri tidak ditemukan.",
  TAGIHAN_TIDAK_DITEMUKAN: "Tagihan belum tersedia. Muat ulang halaman lalu coba lagi.",
  SUDAH_LUNAS: "Tagihan ini sudah lunas.",
  MENUNGGU_PEMBAYARAN: "Ada pembayaran yang sedang menunggu untuk tagihan ini.",
  OTOMATIS_MINIMAL: "Pembayaran otomatis minimal Rp10.000. Gunakan transfer manual untuk nominal lebih kecil.",
  TRANSAKSI_TIDAK_DITEMUKAN: "Transaksi tidak ditemukan.",
  STATUS_TIDAK_DAPAT_DIUBAH: "Status transaksi tidak dapat diubah.",
  BUKTI_WAJIB: "Lampirkan bukti transfer terlebih dahulu.",
  KEPUTUSAN_TIDAK_VALID: "Keputusan konfirmasi tidak valid.",
  KATEGORI_TIDAK_VALID: "Kategori tidak valid.",
  TUJUAN_TIDAK_VALID: "Tujuan masukan tidak valid.",
  ISI_WAJIB: "Judul dan isi masukan wajib diisi.",
  GURU_WAJIB: "Pilih guru tujuan terlebih dahulu.",
  GURU_TIDAK_DITEMUKAN: "Guru tidak ditemukan.",
  FEEDBACK_TIDAK_DITEMUKAN: "Masukan tidak ditemukan.",
  STATUS_TIDAK_VALID: "Status tidak valid.",
  NAMA_TERLALU_PANJANG: "Nama pembayar maksimal 60 karakter.",
  NAMA_PEMBAYAR_WAJIB: "Tuliskan nama pembayar infak terlebih dahulu.",
  NAMA_PEMBAYAR_TIDAK_VALID: "Nama pembayar harus 2-120 karakter.",
};

/** Map a DB error (message or code prefix) to a friendly Indonesian message. */
export function dbErrorMessage(raw: string | null | undefined): string {
  if (!raw) return "Terjadi kesalahan. Coba lagi.";
  const first = raw.trim().split("\n")[0].replace(/^"|"$/g, "").trim();
  return DB_ERROR_MESSAGE[first] ?? "Terjadi kesalahan. Coba lagi.";
}

/** Validate an Indonesian WhatsApp number (display format 08…). */
export function isValidWaNumber(raw: string): boolean {
  return /^\+?[0-9]{8,15}$/.test(raw.trim());
}

/** 0812… / 62812… → 62812… for wa.me links. Returns null when invalid. */
export function waLinkNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return "62" + digits;
  return null;
}

/** Build a wa.me deep link with optional prefilled message. */
export function waLink(number: string | null | undefined, message?: string): string | null {
  const n = waLinkNumber(number);
  if (!n) return null;
  const q = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${n}${q}`;
}
