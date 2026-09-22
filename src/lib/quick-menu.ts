/**
 * V31 — Menu Cepat (dashboard quick menu), definisi bersama.
 *
 * Item didefinisikan sebagai data murni (bukan komponen ikon) supaya bisa
 * dipakai baik dari Server Component (page.tsx) maupun Client Component
 * (quick-menu-editor.tsx) tanpa masalah serialisasi RSC. `icon` adalah nama
 * ikon lucide-react (string) — masing-masing sisi me-resolve sendiri lewat
 * peta ikon lokalnya (lihat QUICK_MENU_ICON_MAP di kedua file).
 */
export type QuickMenuItem = {
  key: string;
  href: string;
  label: string;
  icon: string;
  chip: string;
};

/** Menu Cepat bawaan untuk role USTADZ (guru). Urutan = urutan default. */
export const USTADZ_QUICK_MENU: QuickMenuItem[] = [
  { key: "santri", href: "/ustadz/santri", label: "Santri", icon: "Users", chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { key: "presensi", href: "/ustadz/presensi", label: "Presensi", icon: "ClipboardList", chip: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  { key: "tahfidz", href: "/ustadz/tahfidz", label: "Tahfidz", icon: "GraduationCap", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "tartil", href: "/ustadz/tartil", label: "Tartil", icon: "AudioLines", chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" },
  { key: "setoran", href: "/ustadz/setoran", label: "Setoran", icon: "ClipboardList", chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  { key: "hadits", href: "/ustadz/hadits", label: "Hadits", icon: "BookOpenText", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  { key: "doa", href: "/ustadz/doa", label: "Doa Harian", icon: "HandHeart", chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  { key: "tajwid", href: "/ustadz/tajwid", label: "Tajwid", icon: "SpellCheck", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "tugas", href: "/ustadz/tugas", label: "Tugas", icon: "ListChecks", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "jurnal", href: "/ustadz/jurnal", label: "Custom Jurnal", icon: "NotebookPen", chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" },
  { key: "target", href: "/ustadz/target", label: "Target", icon: "Target", chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  { key: "halaqah", href: "/ustadz/halaqah", label: "Halaqah", icon: "GraduationCap", chip: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300" },
  { key: "perkembangan", href: "/ustadz/perkembangan", label: "Riwayat Perkembangan", icon: "Target", chip: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  { key: "raport", href: "/ustadz/raport", label: "Raport", icon: "NotebookPen", chip: "bg-slate-200 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
  { key: "obrolan", href: "/ustadz/obrolan", label: "Obrolan", icon: "MessagesSquare", chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { key: "saran", href: "/ustadz/saran", label: "Kritik & Saran", icon: "MessageCircleHeart", chip: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300" },
  { key: "pengaturan", href: "/ustadz/pengaturan", label: "Pengaturan", icon: "Settings", chip: "bg-neutral-200 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300" },
];

/**
 * Resolusi urutan + visibilitas akhir dari preferensi tersimpan.
 * `savedKeys`: array key yang TAMPIL, dalam urutan pilihan pengguna.
 * Key yang tidak ada di `savedKeys` dianggap disembunyikan.
 * `null`/kosong -> pakai default (semua tampil, urutan bawaan).
 */
export function resolveQuickMenu(defaults: QuickMenuItem[], savedKeys: string[] | null): QuickMenuItem[] {
  if (!savedKeys || savedKeys.length === 0) return defaults;
  const byKey = new Map(defaults.map((i) => [i.key, i]));
  const resolved: QuickMenuItem[] = [];
  for (const k of savedKeys) {
    const item = byKey.get(k);
    if (item) resolved.push(item);
  }
  return resolved;
}
