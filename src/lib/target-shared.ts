/**
 * TAHFIZH V17 (diperbarui V38) — Target per HALAQAH (client-safe: tanpa import server).
 *
 * Target diatur untuk satu halaqah (bukan per santri) dan hanya ada 3 jenis:
 * Tahfidz Al-Qur'an, Hadits, dan Doa. Satu halaqah punya paling banyak satu
 * target per jenis. Satuan mengikuti jenis target.
 *
 * V54 — isi target DIPILIH guru dari katalog lembaga (menu Tahfidz/Hadits/
 * Doa): `itemIds` berisi ID item katalog; `items` hanya nama tampilan yang
 * diambil dari katalog saat dibaca (jadi rename katalog ikut terbawa).
 * Jumlah (targetValue) = banyak item terpilih. Data lama (diketik bebas)
 * tetap didukung: itemIds kosong + items terisi = mode teks.
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
    itemsLabel: "Surat dari katalog lembaga",
    itemsPlaceholder: "Pilih surat dari katalog Tahfidz lembaga",
    placeholder: "Contoh: An-Naba', An-Nazi'at, 'Abasa",
  },
  HADITS: {
    label: "Hadits",
    unit: "hadits",
    itemsLabel: "Hadits dari katalog lembaga",
    itemsPlaceholder: "Pilih hadits dari katalog Hadits lembaga",
    placeholder: "Contoh: Hadits Niat, Hadits Iman",
  },
  DOA: {
    label: "Doa",
    unit: "doa",
    itemsLabel: "Doa dari katalog lembaga",
    itemsPlaceholder: "Pilih doa dari katalog Doa lembaga",
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
 * Satu target = satu jenis untuk satu halaqah. `itemIds` = ID item katalog
 * lembaga yang dipilih guru (V54, urut); `items` = nama tampilan dari katalog
 * (atau teks ketikan guru pada data lama sebelum V38/V54).
 */
export type HalaqahTarget = {
  id: string;
  halaqahId: string;
  category: TargetCategory;
  scope: TargetScope;
  items: string[];
  itemIds: string[];
  targetValue: number;
  description: string | null;
  updatedAt: string;
};

/** Satu opsi katalog untuk picker target (V54; V55 + isActive utk kelola). */
export type TargetCatalogItem = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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
