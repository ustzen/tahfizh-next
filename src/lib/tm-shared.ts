/**
 * TM (Tatap Muka) — nomor urut pertemuan halaqah.
 * Tanggal sesi presensi satu halaqah diurutkan dari yang paling awal:
 * pertemuan pertama = TM 1, kedua = TM 2, dst. (mis. 1 Jan = TM 1, 5 Jan = TM 2).
 * Nomor TIDAK disimpan; selalu dihitung dari tanggal sesi. Client-safe.
 */

/** TM untuk `date` dari daftar tanggal sesi. exists=false → pertemuan baru (belum disimpan). */
export function tmFromDates(dates: string[], date: string): { no: number; exists: boolean } {
  const sorted = Array.from(new Set(dates)).sort();
  const idx = sorted.indexOf(date);
  if (idx >= 0) return { no: idx + 1, exists: true };
  return { no: sorted.filter((d) => d < date).length + 1, exists: false };
}

/** Peta tanggal → nomor TM untuk seluruh daftar tanggal sesi. */
export function tmByDateMap(dates: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  Array.from(new Set(dates))
    .sort()
    .forEach((d, i) => {
      out[d] = i + 1;
    });
  return out;
}

/** ISO timestamp → tanggal YYYY-MM-DD zona Asia/Jakarta. */
export function wibDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
