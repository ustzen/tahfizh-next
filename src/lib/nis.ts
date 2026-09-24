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

/** Urut berdasarkan NIS (numerik-natural, naik); NIS kosong di akhir, lalu nama. */
export function compareByNis(
  a: { nis: string | null | undefined; name: string },
  b: { nis: string | null | undefined; name: string }
): number {
  const an = (a.nis ?? "").trim();
  const bn = (b.nis ?? "").trim();
  if (!an && bn) return 1;
  if (an && !bn) return -1;
  if (an && bn) {
    const c = an.localeCompare(bn, "id", { numeric: true, sensitivity: "base" });
    if (c !== 0) return c;
  }
  return a.name.localeCompare(b.name, "id");
}
