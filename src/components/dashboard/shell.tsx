import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { ForceChangePasswordCard } from "@/components/akun/force-change-password-card";
import { Logo } from "@/components/logo";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { DashboardHeader } from "@/components/dashboard/header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import type { AppRole } from "@/lib/roles";
import { ROLE_LABELS } from "@/lib/roles";
import {
  getTerminology,
  resolveNavGroups,
  resolveBottomNav,
  BOTTOM_NAV_DEFAULT_KEYS,
  type TerminologyMap,
} from "@/lib/terminology";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import { createClient } from "@/lib/supabase/server";
import { getNotificationList, getUnreadNotificationCount } from "@/lib/v10";

/**
 * Shared dashboard chrome (sidebar + header). Rendered ONCE per role section
 * via nested layouts, so client-side navigation never re-mounts it — menu
 * switches feel like tabs (V1 rule #28/#29).
 *
 * V2: resolves tenant terminology + the user's menu order server-side.
 * V12: menu dikelompokkan per kategori berlabel (NavGroup) + search global.
 */
export async function DashboardShell({
  role,
  fullName,
  tenantId,
  tenantName,
  tenantCode,
  avatarUrl,
  children,
}: {
  role: AppRole;
  fullName: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantCode: string | null;
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  const [terms, menuOrder, bottomNavOrder, notifications, unreadCount, mustChangePassword, iconOverrides] =
    await Promise.all([
      getTerminology(tenantId),
      getMenuOrder(),
      getBottomNavOrder(),
      getNotificationList(),
      getUnreadNotificationCount(),
      getMustChangePassword(),
      getMenuIconOverrides(),
    ]);

  // Gender-aware role naming (rule #17): USTADZ + P shows Ustadzah label.
  const gender = await getOwnGender();
  const roleLabel =
    role === "USTADZ" && gender === "P"
      ? terms.ustadzah || "Ustadzah"
      : ROLE_LABELS[role];

  const navGroups = resolveNavGroups(role, terms, gender, menuOrder);
  const allNavItems = navGroups.flatMap((g) => g.items);
  const bottomNavItems = resolveBottomNav(role, allNavItems, bottomNavOrder);

  // Nama role untuk atribut CSS — WALI_SANTRI tampil sebagai "santri" (V12).
  const roleKey = role === "WALI_SANTRI" ? "santri" : role.toLowerCase();

  return (
    <div className="flex min-h-screen" data-role={roleKey}>
      {/* Desktop sidebar — dark-mode aware */}
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r p-5 lg:flex">
        <Link href="/" className="mb-6" aria-label="TAHFIZH">
          <Logo />
        </Link>
        <p className="bg-role-soft text-role-strong mx-1 mb-3 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[0.72rem] font-bold">
          {roleLabel}
        </p>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav groups={navGroups} iconOverrides={iconOverrides} />
        </div>
        <div className="bg-role-soft mt-3 flex items-center gap-3 rounded-2xl p-3">
          <span className="bg-role text-role-ink flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
            {fullName?.[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.82rem] font-semibold">{fullName}</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {tenantName ?? "Platform TAHFIZH"}
            </p>
          </div>
        </div>
        {/* Tombol Keluar — pojok kiri paling bawah sidebar */}
        <form action={logoutAction} className="mt-3">
          <button
            type="submit"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-red-600 dark:text-red-300 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </form>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          role={role}
          roleLabel={roleLabel}
          fullName={fullName}
          tenantName={tenantName}
          tenantCode={tenantCode}
          avatarUrl={avatarUrl}
          navGroups={navGroups}
          notifications={notifications}
          unreadCount={unreadCount}
          bottomNavAllItems={allNavItems}
          bottomNavSelected={bottomNavItems}
          bottomNavDefaultKeys={BOTTOM_NAV_DEFAULT_KEYS[role]}
          iconOverrides={iconOverrides}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:pb-6">
          {/* V12.11 — wajib ganti password untuk SEMUA role (password sementara
              dari admin: guru/koordinator/santri yang di-reset lewat fitur
              V12.4/V12.5). Kartu juga tampil di dasbor santri (duplikat aman). */}
          {mustChangePassword && <ForceChangePasswordCard />}
          {children}
        </main>
      </div>

      {/* V32 — Menu Bawah: bar navigasi 4 menu, khusus mobile, bisa diatur per akun. */}
      <BottomNav items={bottomNavItems} iconOverrides={iconOverrides} />
    </div>
  );
}

/* Small server helpers (single round-trip each, request-cached via React). */
import { cache } from "react";

const getMenuOrder = cache(async (): Promise<string[] | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("menu_order")
    .eq("id", data.user.id)
    .single();
  return (profile?.menu_order as string[] | null) ?? null;
});

const getBottomNavOrder = cache(async (): Promise<string[] | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("bottom_nav_menu")
    .eq("id", data.user.id)
    .single();
  return (profile?.bottom_nav_menu as string[] | null) ?? null;
});

const getMustChangePassword = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", data.user.id)
    .single();
  return profile?.must_change_password === true;
});

const getOwnGender = cache(async (): Promise<"L" | "P" | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("gender")
    .eq("id", data.user.id)
    .single();
  return (profile?.gender as "L" | "P" | null) ?? null;
});

export type { TerminologyMap };
