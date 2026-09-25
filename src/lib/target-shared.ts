/**
 * TAHFIZH V17 (diperbarui V38) — Target per HALAQAH (client-safe: tanpa import server).
 *
 * Target diatur untuk satu halaqah (bukan per santri) dan hanya ada 3 jenis:
 * Tahfidz Al-Qur'an, Hadits, dan Doa. Satu halaqah punya paling banyak satu
 * target per jenis. Satuan mengikuti jenis target.
 *
 * V38 — isi target DIKETIK guru (daftar nama), satu per baris:
 *   TAHFIDZ = nama surat, HADITS = nama hadits, DOA = nama doa.
 * Jumlah (targetValue) dihitung otomatis dari banyaknya baris.
 * Cakupan: TAHUN = 1 tahun ajaran, GANJIL = semester ganjil, GENAP = semester
 * genap. Tidak ada lagi tanggal mulai/selesai — periode capaian mengikuti
 * tahun ajaran / semester aktif di database (lihat `target_scope_period`).
 *
 * Akses data server ada di `lib/target-halaqah.ts`; mutasi di
 * `app/actions/target-halaqah.ts`.
 */

export const TARGET_CATEGORIES = ["TAHFIDZ", "HADITS", "DOA"] as const;
export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export const TARGET_CATEGORY_META: Record<
  TargetCategory,
  { label: string; unit: string; itemsLabel: string; itemsPlaceholder: string; placeholder: string }
> = {
  TAHFIDZ: {
    label: "Tahfidz Al-Qur'an",
    unit: "surat",
    itemsLabel: "Nama surat yang ditargetkan",
    itemsPlaceholder: "Tulis nama surat, satu per baris:\nAn-Naba'\nAn-Nazi'at\n'Abasa",
    placeholder: "Contoh: An-Naba', An-Nazi'at, 'Abasa",
  },
  HADITS: {
    label: "Hadits",
    unit: "hadits",
    itemsLabel: "Nama hadits yang ditargetkan",
    itemsPlaceholder: "Tulis nama hadits, satu per baris:\nHadits Niat\nHadits Iman\nHadits Islam",
    placeholder: "Contoh: Hadits Niat, Hadits Iman",
  },
  DOA: {
    label: "Doa",
    unit: "doa",
    itemsLabel: "Nama doa yang ditargetkan",
    itemsPlaceholder: "Tulis nama doa, satu per baris:\nDoa sebelum makan\nDoa setelah makan\nDoa masuk masjid",
    placeholder: "Contoh: Doa sebelum makan, Doa setelah makan",
  },
};

export function isTargetCategory(v: unknown): v is TargetCategory {
  return typeof v === "string" && (TARGET_CATEGORIES as readonly string[]).includes(v);
}

/** Cakupan periode target — menggantikan tanggal mulai/selesai (V38). */
export const TARGET_SCOPES = ["TAHUN", "GANJIL", "GENAP"] as const;
export type TargetScope = (typeof TARGET_SCOPES)[number];

export const TARGET_SCOPE_LABEL: Record<TargetScope, string> = {
  TAHUN: "1 Tahun Ajaran",
  GANJIL: "Semester Ganjil",
  GENAP: "Semester Genap",
};

export function isTargetScope(v: unknown): v is TargetScope {
  return typeof v === "string" && (TARGET_SCOPES as readonly string[]).includes(v);
}

/** Halaqah yang diampu guru (untuk daftar di menu Target). */
export type TargetHalaqah = {
  id: string;
  name: string;
  studentCount: number;
};

/**
 * Satu target = satu jenis untuk satu halaqah. `items` adalah daftar yang
 * diketik guru (satu nama per baris); bisa kosong pada data lama (sebelum
 * V38) yang masih menyimpan jumlah saja.
 */
export type HalaqahTarget = {
  id: string;
  halaqahId: string;
  category: TargetCategory;
  scope: TargetScope;
  items: string[];
  targetValue: number;
  description: string | null;
  updatedAt: string;
};

export type TargetOverview = {
  halaqah: TargetHalaqah[];
  targets: HalaqahTarget[];
};

/**
 * Pecah isi yang diketik menjadi daftar nama. Pemisah: baris baru, koma,
 * atau titik koma (sama seperti aturan database) — buang kosong & rapikan
 * spasi. Maksimal 500 item dan 5000 karakter (batas kolom `items`).
 */
export function parseTargetItems(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 500);
}

/** Batas aman agar tidak menabrak constraint `items <= 5000` di database. */
export function targetItemsTooLong(raw: string): boolean {
  return parseTargetItems(raw).join("\n").length > 5000;
}
