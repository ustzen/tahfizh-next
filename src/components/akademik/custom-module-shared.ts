import {
  Award,
  BookOpen,
  Globe2,
  Heart,
  Mic,
  Music,
  Palette,
  PenLine,
  Sparkles,
  Star,
} from "lucide-react";

/**
 * TAHFIZH V58 — Visual bersama modul lembaga kustom.
 * Ikon (lucide) dan tone warna dipilih lembaga saat menambah modul; dasbor
 * santri & manajer modul memakai peta yang sama agar tampil konsisten.
 */

export type CustomModuleIconOption = { key: string; label: string };

export const CUSTOM_MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star,
  book: BookOpen,
  pen: PenLine,
  heart: Heart,
  sparkles: Sparkles,
  award: Award,
  mic: Mic,
  palette: Palette,
  globe: Globe2,
  music: Music,
};

export const CUSTOM_MODULE_ICON_OPTIONS: CustomModuleIconOption[] = [
  { key: "star", label: "Bintang" },
  { key: "book", label: "Buku" },
  { key: "pen", label: "Pena" },
  { key: "heart", label: "Hati" },
  { key: "sparkles", label: "Kilau" },
  { key: "award", label: "Medali" },
  { key: "mic", label: "Mikrofon" },
  { key: "palette", label: "Seni" },
  { key: "globe", label: "Bahasa" },
  { key: "music", label: "Musik" },
];

export function customModuleIconFor(key: string) {
  return CUSTOM_MODULE_ICONS[key] ?? Star;
}

/** Chip ikon + aksen tile sesuai tone modul. */
export const CUSTOM_MODULE_TONES: Record<string, { chip: string; tile: string; bar: string }> = {
  emerald: {
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    tile: "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
    bar: "bg-emerald-500",
  },
  blue: {
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    tile: "bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100",
    bar: "bg-blue-500",
  },
  sky: {
    chip: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
    tile: "bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100",
    bar: "bg-sky-500",
  },
  violet: {
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
    tile: "bg-violet-50 text-violet-900 dark:bg-violet-500/10 dark:text-violet-100",
    bar: "bg-violet-500",
  },
  rose: {
    chip: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    tile: "bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100",
    bar: "bg-rose-500",
  },
  amber: {
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    tile: "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
    bar: "bg-amber-500",
  },
  orange: {
    chip: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300",
    tile: "bg-orange-50 text-orange-900 dark:bg-orange-500/10 dark:text-orange-100",
    bar: "bg-orange-500",
  },
  teal: {
    chip: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300",
    tile: "bg-teal-50 text-teal-900 dark:bg-teal-500/10 dark:text-teal-100",
    bar: "bg-teal-500",
  },
  cyan: {
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300",
    tile: "bg-cyan-50 text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-100",
    bar: "bg-cyan-500",
  },
  indigo: {
    chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
    tile: "bg-indigo-50 text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100",
    bar: "bg-indigo-500",
  },
};

export function customModuleToneFor(tone: string) {
  return CUSTOM_MODULE_TONES[tone] ?? CUSTOM_MODULE_TONES.emerald;
}
