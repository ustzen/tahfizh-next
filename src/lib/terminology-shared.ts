/**
 * Client-safe terminology constants & pure helpers (no server imports).
 * The DB-backed resolver lives in src/lib/terminology.ts (server only).
 */

export const TERMINOLOGY_KEYS = [
  "santri",
  "guru",
  "ustadz",
  "ustadzah",
  "wali_santri",
  "koordinator",
  "admin",
  "kepala_lembaga",
  "lembaga",
  "kelas",
  "halaqah",
] as const;

export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];
export type TerminologyMap = Record<TerminologyKey, string>;

export const DEFAULT_TERMINOLOGY: TerminologyMap = {
  santri: "Santri",
  guru: "Guru",
  ustadz: "Ustadz",
  ustadzah: "Ustadzah",
  wali_santri: "Santri",
  koordinator: "Koordinator",
  admin: "Admin",
  kepala_lembaga: "Kepala Sekolah",
  lembaga: "Lembaga",
  kelas: "Kelas",
  halaqah: "Halaqah",
};

/** "Drs." + "Ahmad Fauzi" + "M.Pd." -> "Drs. Ahmad Fauzi, M.Pd." */
export function formatFullName(
  frontTitle?: string | null,
  fullName?: string | null,
  backTitle?: string | null
): string {
  const parts: string[] = [];
  if (frontTitle?.trim()) parts.push(frontTitle.trim());
  if (fullName?.trim()) parts.push(fullName.trim());
  let out = parts.join(" ");
  if (backTitle?.trim()) out = out ? `${out}, ${backTitle.trim()}` : backTitle.trim();
  return out || "-";
}
