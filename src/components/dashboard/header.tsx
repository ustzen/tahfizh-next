"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/logo";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { BottomNavEditorButton } from "@/components/dashboard/bottom-nav";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import type { MenuIconOverride } from "@/lib/menu-icons";
import type { NavGroup, NavEntry } from "@/lib/terminology";
import type { NotificationRow } from "@/lib/v10";

type HeaderProps = {
  role: AppRole;
  roleLabel: string;
  fullName: string;
  tenantName: string | null;
  /** V12: kode tenant (T-101) TIDAK PERNAH ditampilkan ke pengguna — internal saja. */
  tenantCode: string | null;
  avatarUrl?: string | null;
  navGroups: NavGroup[];
  notifications?: NotificationRow[];
  unreadCount?: number;
  bottomNavAllItems: NavEntry[];
  bottomNavSelected: NavEntry[];
  bottomNavDefaultKeys: string[];
  /** V39 — override ikon menu platform untuk sidebar drawer & editor Menu Bawah. */
  iconOverrides?: MenuIconOverride[];
};

export function DashboardHeader({
  role,
  roleLabel,
  fullName,
  tenantName,
  tenantCode,
  avatarUrl,
  navGroups,
  notifications = [],
  unreadCount = 0,
  bottomNavAllItems,
  bottomNavSelected,
  bottomNavDefaultKeys,
  iconOverrides = [],
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Tutup drawer saat pindah halaman.
  useEffect(() => setOpen(false), [pathname]);

  // Longest matching nav href wins (e.g. /admin/pengaturan/profil -> Pengaturan).
  const current =
    navGroups
      .flatMap((g) => g.items)
      .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "Dashboard";

  // Kunci scroll body saat drawer terbuka (mobile tidak bertumpuk).
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover" />
  ) : (
    <div className="bg-gradient-brand flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
      {fullName?.[0]?.toUpperCase() ?? "?"}
    </div>
  );

  return (
    <>
      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      {/* Mobile bar — tiga zona sejajar, tidak bertumpuk */}
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          aria-expanded={open}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-500/10"
        >
          <Menu className="size-5.5" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
          <Logo showText={false} />
          <span className="truncate text-[0.68rem] font-semibold text-slate-500 dark:text-slate-400">
            {tenantName ?? "TAHFIZH"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`${ROLE_HOME[role]}/pengaturan/profil`}
            aria-label="Profil saya"
            className="flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-muted dark:hover:bg-slate-500/10"
          >
            {avatar}
          </Link>
        </div>
      </div>

      {/* Mobile search strip */}
      <div className="border-t px-3 pb-2 pt-1.5 lg:hidden">
        <GlobalSearch variant="mobile" />
      </div>

      {/* Desktop bar */}
      <div className="hidden h-16 items-center justify-between gap-4 px-6 lg:flex">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            {roleLabel}
          </p>
          <h1 className="truncate text-lg font-bold tracking-tight">{current}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <GlobalSearch variant="desktop" />
          <NotificationBell items={notifications} unread={unreadCount} />
          <ThemeToggle compact />
          {tenantName ? (
            <div className="text-right">
              <p className="max-w-48 truncate text-sm font-semibold">{tenantName}</p>
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Platform TAHFIZH</p>
          )}
          <Link href={`${ROLE_HOME[role]}/pengaturan/profil`} aria-label="Pengaturan profil">
            {avatar}
          </Link>
        </div>
      </div>

      </header>

      {/* Mobile drawer — overlay penuh, scrollable, auto-close setelah pilih menu.
          PENTING: harus di LUAR <header>. backdrop-filter pada header menjadikan
          elemen position:fixed di dalamnya terkurung ukuran header (bukan
          viewport) — itulah penyebab tampilan berantakan saat menu dibuka di HP. */}
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="bg-background absolute inset-y-0 left-0 flex w-[85vw] max-w-80 flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted dark:hover:bg-slate-500/10"
              >
                <X className="size-5.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 border-b px-4 py-3">
              {avatar}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{fullName}</p>
                {tenantName && (
                  <p className="text-muted-foreground truncate text-xs">{tenantName}</p>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-8">
              <SidebarNav
                groups={navGroups}
                onNavigate={() => setOpen(false)}
                prefetch={false}
                iconOverrides={iconOverrides}
              />
            </div>

            <div className="border-t px-4 py-3">
              <BottomNavEditorButton
                allItems={bottomNavAllItems}
                selected={bottomNavSelected}
                defaultKeys={bottomNavDefaultKeys}
                iconOverrides={iconOverrides}
              />
            </div>

            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  Tema
                </span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
