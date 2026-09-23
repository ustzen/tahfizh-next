/**
 * TAHFIZH V17 — Target per HALAQAH (client-safe: tanpa import server).
 *
 * Target diatur untuk satu halaqah (bukan per santri) dan hanya ada 3 jenis:
 * Tahfidz Al-Qur'an, Hadits, dan Doa. Satu halaqah punya paling banyak satu
 * target per jenis. Satuan mengikuti jenis target.
 *
 * Akses data server ada di `lib/target-halaqah.ts`; mutasi di
 * `app/actions/target-halaqah.ts`.
 */

export const TARGET_CATEGORIES = ["TAHFIDZ", "HADITS", "DOA"] as const;
export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export const TARGET_CATEGORY_META: Record<
  TargetCategory,
  { label: string; unit: string; placeholder: string }
> = {
  TAHFIDZ: {
    label: "Tahfidz Al-Qur'an",
    unit: "surat",
    placeholder: "Contoh: Juz 30 (An-Naba' s.d. An-Nas)",
  },
  HADITS: {
    label: "Hadits",
    unit: "hadits",
    placeholder: "Contoh: Arba'in An-Nawawi hadits 1–10",
  },
  DOA: {
    label: "Doa",
    unit: "doa",
    placeholder: "Contoh: Doa sehari-hari (makan, tidur, masuk masjid)",
  },
};

export function isTargetCategory(v: unknown): v is TargetCategory {
  return typeof v === "string" && (TARGET_CATEGORIES as readonly string[]).includes(v);
}

/** Halaqah yang diampu guru (untuk daftar di menu Target). */
export type TargetHalaqah = {
  id: string;
  name: string;
  studentCount: number;
};

/** Satu target = satu jenis untuk satu halaqah. */
export type HalaqahTarget = {
  id: string;
  halaqahId: string;
  category: TargetCategory;
  targetValue: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description: string | null;
  updatedAt: string;
};

export type TargetOverview = {
  halaqah: TargetHalaqah[];
  targets: HalaqahTarget[];
};

/** true bila periode target sudah lewat (tanggal akhir < hari ini). */
export function isTargetEnded(endDate: string, today = new Date()): boolean {
  const end = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < today.getTime();
}
