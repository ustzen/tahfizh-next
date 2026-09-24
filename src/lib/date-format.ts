/**
 * Format tanggal seragam untuk seluruh aplikasi: dd/mm/yyyy
 * (dan dd/mm/yyyy HH:mm bila disertai jam). Zona waktu tetap Asia/Jakarta
 * agar server & browser menampilkan hari yang sama.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const TZ = "Asia/Jakarta";

function parts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** dd/mm/yyyy. Menerima "YYYY-MM-DD", ISO timestamp, atau Date. */
export function fmtDMY(value: string | Date | null | undefined, fallback = "-"): string {
  if (!value) return fallback;
  if (typeof value === "string") {
    const m = DATE_ONLY.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** dd/mm/yyyy HH:mm */
export function fmtDMYHM(value: string | Date | null | undefined, fallback = "-"): string {
  if (!value) return fallback;
  if (typeof value === "string" && DATE_ONLY.test(value.trim())) return fmtDMY(value, fallback);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
