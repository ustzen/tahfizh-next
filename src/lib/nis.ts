/**
 * NIS lembaga yang layak ditampilkan. Nomor ID web (students.business_code,
 * mis. "S-21") BUKAN NIS: bila nilai kolom nis kosong, sama dengan
 * business_code, atau berpola nomor ID web ("S-21"), tampilkan kosong.
 */
export function cleanNis(nis: string | null | undefined, businessCode?: string | null): string | null {
  const v = (nis ?? "").trim();
  if (!v) return null;
  if (businessCode && v.toLowerCase() === businessCode.trim().toLowerCase()) return null;
  if (/^[A-Za-z]-\d+$/.test(v)) return null;
  return v;
}
