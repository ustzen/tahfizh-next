"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  BookMarked,
  GraduationCap,
  BookOpenCheck,
  AudioLines,
  ClipboardList,
  BookOpenText,
  HandHeart,
  SpellCheck,
  ListChecks,
  NotebookPen,
  Target as TargetIcon,
  FileText,
  Users2,
  CalendarCheck,
  CalendarRange,
  Rocket,
  History,
  HandCoins,
  MessageSquareText,
  MessageCircle,
  Settings,
} from "lucide-react";

import type { NavEntry, NavGroup } from "@/lib/terminology";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  lembaga: Building2,
  pengguna: Users,
  guru: BookMarked,
  santri: GraduationCap,
  tahfidz: BookOpenCheck,
  tartil: AudioLines,
  setoran: ClipboardList,
  hadits: BookOpenText,
  doa: HandHeart,
  tajwid: SpellCheck,
  tugas: ListChecks,
  jurnal: NotebookPen,
  target: TargetIcon,
  raport: FileText,
  halaqah: Users2,
  presensi: CalendarCheck,
  anak: GraduationCap,
  infak: HandCoins,
  akademik: CalendarRange,
  onboarding: Rocket,
  perkembangan: History,
  saran: MessageSquareText,
  whatsapp: MessageCircle,
  pengaturan: Settings,
};

/**
 * Warna aksen per kategori menu (V12 #19/#48) — harmonis, biru tetap utama.
 * V12: menu TIDAK AKTIF tampil netral (bukan biru); warna aksen hanya muncul
 * saat menu sedang dibuka (aktif).
 */
const GROUP_STYLES: Record<string, { label: string; dot: string; active: string }> = {
  utama: {
    label: "",
    dot: "",
    // Biru solid utama dengan tepi kuning tipis (aksen pinggiran).
    active: "bg-primary text-white shadow-card ring-1 ring-inset ring-yellow-400/70 hover:bg-primary/95",
  },
  master: {
    label: "Master Data",
    dot: "bg-cyan-500",
    active: "bg-cyan-600 text-white shadow-card hover:bg-cyan-600",
  },
  pembelajaran: {
    label: "Pembelajaran",
    dot: "bg-emerald-500",
    active: "bg-emerald-600 text-white shadow-card hover:bg-emerald-600",
  },
  presensi: {
    label: "Presensi",
    dot: "bg-orange-500",
    active: "bg-orange-500 text-white shadow-card hover:bg-orange-500",
  },
  laporan: {
    label: "Laporan",
    dot: "bg-violet-500",
    active: "bg-violet-600 text-white shadow-card hover:bg-violet-600",
  },
  keuangan: {
    label: "Keuangan",
    dot: "bg-amber-500",
    active: "bg-amber-500 text-white shadow-card hover:bg-amber-500",
  },
  komunitas: {
    label: "Komunitas",
    dot: "bg-sky-500",
    active: "bg-sky-600 text-white shadow-card hover:bg-sky-600",
  },
  pengaturan: {
    label: "Pengaturan & Privacy",
    dot: "bg-indigo-500",
    active: "bg-indigo-600 text-white shadow-card hover:bg-indigo-600",
  },
};

function NavLinks({
  groups,
  pathname,
  onNavigate,
  prefetchEnabled,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  prefetchEnabled: boolean;
}) {
  return (
    <>
      {groups.map((group) => {
        const style = GROUP_STYLES[group.key] ?? GROUP_STYLES.utama;
        return (
          <div key={group.key} className="mb-3 last:mb-0">
            {style.label && (
              <p className="text-muted-foreground mb-1 flex items-center gap-1.5 px-3 text-[0.66rem] font-bold uppercase tracking-widest">
                <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
                {style.label}
              </p>
            )}
            <nav className="space-y-0.5" aria-label={style.label || "Menu utama"}>
              {group.items.map((item) => {
                const Icon =
                  ICONS[item.key] ?? (item.href.endsWith("/pengaturan") ? Settings : LayoutDashboard);
                // V12: hanya menu yang persis dibuka yang dianggap aktif —
                // "Ringkasan" (/admin) tidak ikut menyala saat membuka
                // /admin/guru, /admin/santri, dst.
                const active =
                  pathname === item.href ||
                  (item.href !== "/" &&
                    !/^\/(admin|koordinator|ustadz|wali|developer)$/.test(item.href) &&
                    pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={prefetchEnabled}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] font-medium transition-colors",
                      active
                        ? style.active
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-500/10 dark:hover:text-white"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        );
      })}
    </>
  );
}

/**
 * Role navigation — V12: menu dikelompokkan per kategori berlabel dengan
 * warna aksen berbeda; tetap terminology-aware + urutan menu per user (V2)
 * dan prefetch rute saudara (V1 rule #30).
 */
export function SidebarNav({
  groups,
  onNavigate,
  prefetch = true,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  prefetch?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Prefetch sibling routes of this role only (V1 rule #30).
  useEffect(() => {
    if (!prefetch) return;
    for (const group of groups) {
      for (const item of group.items) {
        if (!pathname.startsWith(item.href)) router.prefetch(item.href);
      }
    }
  }, [groups, pathname, router, prefetch]);

  return (
    <div>
      <NavLinks
        groups={groups}
        pathname={pathname}
        onNavigate={onNavigate}
        prefetchEnabled={prefetch}
      />
    </div>
  );
}
