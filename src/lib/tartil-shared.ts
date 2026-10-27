/**
 * TAHFIZH V4 — client-safe Tartil constants (no server imports).
 * Server data access lives in src/lib/tartil.ts (import "server-only").
 */

export const NOTE_SLOTS = [
  "APRESIASI",
  "BACAAN",
  "TAJWID",
  "KELANCARAN",
  "SEMANGAT",
  "FASHOHAH",
  "SARAN",
  "CATATAN_ORANG_TUA",
] as const;

export type NoteSlot = (typeof NOTE_SLOTS)[number];

export const NOTE_SLOT_LABELS: Record<NoteSlot, string> = {
  APRESIASI: "Apresiasi",
  BACAAN: "Bacaan",
  TAJWID: "Tajwid",
  KELANCARAN: "Kelancaran",
  SEMANGAT: "Semangat",
  FASHOHAH: "Fashohah",
  SARAN: "Saran untuk Orang Tua",
  CATATAN_ORANG_TUA: "Catatan untuk Orang Tua",
};

/** Warna label kategori template catatan (sesuai desain jurnal guru). */
export const NOTE_SLOT_COLORS: Record<NoteSlot, string> = {
  APRESIASI: "text-rose-600",
  BACAAN: "text-blue-600",
  TAJWID: "text-amber-600",
  KELANCARAN: "text-emerald-600",
  SEMANGAT: "text-violet-600",
  FASHOHAH: "text-cyan-600",
  SARAN: "text-teal-600",
  CATATAN_ORANG_TUA: "text-slate-600",
};

/**
 * Penilaian TERAKHIR per santri — dipakai form Tartil guru untuk mengisi
 * Jilid + Halaman otomatis (mis. Zain terakhir Iqro Jilid 4 halaman 5).
 */
export type TartilLastAssessment = {
  studentId: string;
  materialId: string;
  /** Label halaman apa adanya: "5" atau "3-5". */
  pagesLabel: string | null;
  /** ISO timestamp penilaian terakhir. */
  assessedAt: string;
};

/**
 * "5" → {from:"5",to:"5"}; "3-5" → {from:"3",to:"5"}; selain itu null.
 * Halaman TERAKHIR dibaca = angka paling akhir.
 */
export function parsePagesLabel(label: string | null | undefined): { from: string; to: string } | null {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec((label ?? "").trim());
  if (!m) return null;
  return { from: m[1], to: m[2] ?? m[1] };
}

/**
 * Jilid + halaman terakhir yang dinilai di antara sekelompok santri: entri
 * PALING BARU; bila beberapa santri dinilai pada hari terbaru yang sama, jilid
 * yang paling banyak dipakai pada hari itu menang.
 */
export function pickLatestAssessment(list: TartilLastAssessment[]): TartilLastAssessment | null {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : a.assessedAt > b.assessedAt ? -1 : 0));
  const day = sorted[0].assessedAt.slice(0, 10);
  const sameDay = sorted.filter((x) => x.assessedAt.slice(0, 10) === day);
  const count = new Map<string, number>();
  for (const x of sameDay) count.set(x.materialId, (count.get(x.materialId) ?? 0) + 1);
  let bestId = sameDay[0].materialId;
  let bestN = 0;
  for (const [id, n] of count) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  return sameDay.find((x) => x.materialId === bestId) ?? sorted[0];
}
