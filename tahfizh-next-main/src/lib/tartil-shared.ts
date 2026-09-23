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
