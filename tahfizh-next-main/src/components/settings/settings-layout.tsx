import Link from "next/link";
import { UserRound, ShieldCheck, PanelTop, Languages, IdCard, Crown, BookOpenCheck, AudioLines, ClipboardList, Library, NotebookPen, ScrollText, Settings } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  profil: UserRound,
  keamanan: ShieldCheck,
  menu: PanelTop,
  tahfidz: BookOpenCheck,
  tartil: AudioLines,
  setoran: ClipboardList,
  materi: Library,
  jurnal: NotebookPen,
  terminologi: Languages,
  identitas: IdCard,
  pimpinan: Crown,
  audit: ScrollText,
};

/** Warna chip ikon per bagian — supaya tiap menu pengaturan mudah dikenali. */
const SECTION_TONES: Record<string, string> = {
  profil: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  keamanan: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  menu: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  tahfidz: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  tartil: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  setoran: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  materi: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  jurnal: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  terminologi: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  identitas: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  pimpinan: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  audit: "bg-slate-200 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

/**
 * Settings chrome: small sidebar of sections + content area.
 * Rendered inside each role's dashboard layout so the main sidebar/header
 * stay mounted (tab-like navigation preserved).
 */
export function SettingsLayout({
  role,
  sections,
  active,
  title,
  description,
  children,
}: {
  role: string;
  sections: { key: string; label: string; href: string }[];
  active: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} icon={<Settings className="size-6" />} />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Bagian pengaturan" className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {sections.map((s) => {
              const Icon = SECTION_ICONS[s.key] ?? UserRound;
              const isActive = s.key === active;
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  prefetch
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-role-soft text-role-strong ring-role/30 font-semibold ring-1"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-500/10 dark:hover:text-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      SECTION_TONES[s.key] ?? SECTION_TONES.audit
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {s.label}
                </Link>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-4 hidden px-3.5 text-xs leading-relaxed lg:block">
            Pengaturan hanya berlaku untuk akun dan lembaga Anda sendiri.
          </p>
        </nav>

        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}
