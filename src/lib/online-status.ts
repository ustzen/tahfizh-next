/**
 * TAHFIZH V50 — format status "terakhir online" akun wali santri.
 * Dipakai kolom Online di menu Data Santri (admin/koordinator/ustadz).
 */

/** Label singkat: "Online", "5 mnt", "2 jam", "3 hr", "12 Mei", atau "—" (null). */
export function lastOnlineLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "Online";

  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Online";
  if (min < 60) return `${min} mnt lalu`;
  const jam = Math.floor(min / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hr lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** Warna titik status: hijau <5 mnt, kuning <24 jam, abu selebihnya / tidak ada data. */
export function onlineDotTone(iso: string | null | undefined): string {
  if (!iso) return "bg-slate-300 dark:bg-slate-600";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return "bg-slate-300 dark:bg-slate-600";
  if (diff < 5 * 60_000) return "bg-emerald-500";
  if (diff < 24 * 3600_000) return "bg-amber-400";
  return "bg-slate-300 dark:bg-slate-600";
}

/** Judul tooltip berisi waktu persis. */
export function onlineTitle(iso: string | null | undefined): string {
  if (!iso) return "Belum pernah login";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Belum pernah login";
  return `Terakhir online: ${d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`;
}
