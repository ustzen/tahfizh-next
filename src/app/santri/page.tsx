import { CalendarDays } from "lucide-react";
import { ChevronDown } from "lucide-react";

import { CardBox, SectionTitle } from "@/components/dashboard/section";
import { ForceChangePasswordCard } from "@/components/akun/force-change-password-card";
import { QuickMenuEditorButton, QuickMenuGrid } from "@/components/dashboard/quick-menu-editor";
import { requireRole } from "@/lib/auth";
import { getDisplayProfile } from "@/lib/layout-data";
import { SANTRI_QUICK_MENU, SANTRI_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";
import { createClient } from "@/lib/supabase/server";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import { SantriHomeCard } from "@/components/santri/santri-home-card";
import { getPrestasiCards, getPresensiRekap, getSantriTargetProgress, getMeterTotals } from "@/lib/santri-pantauan";

export const metadata = { title: "Dashboard Santri" };

async function getDashboardQuickMenuOrder(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("dashboard_quick_menu")
    .eq("id", userId)
    .single();
  return (data?.dashboard_quick_menu as string[] | null) ?? null;
}

/** Tanggal hari ini (zona Asia/Jakarta) dalam format Indonesia. */
function hariIniJakarta(): string {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Dasbor Santri — V57 gaya "Santri Hebat": hero sapaan + tanggal & avatar,
 * kartu ringkasan (pil statistik, Modul Pembelajaran, Kehadiran bulanan,
 * banner motivasi), lalu Menu Cepat besar ke semua modul.
 */
export default async function SantriDashboardPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri");

  const [savedQuickMenu, ownProfileRes, iconOverrides, prestasiCards, presensiRekap, santriTargets, meterTotalsMap, display] =
    await Promise.all([
      getDashboardQuickMenuOrder(profile.id),
      createClient().then((supabase) =>
        supabase.from("profiles").select("must_change_password").eq("id", profile.id).single()
      ),
      getMenuIconOverrides(),
      getPrestasiCards(),
      getPresensiRekap(6),
      // V57b — target guru (untuk tile Tahfidz berbasis target).
      getSantriTargetProgress(),
      // V57c — penyebut modul lain (tugas/hadits/doa/tajwid, sudah target-aware).
      getMeterTotals(),
      getDisplayProfile(),
    ]);
  const mustChangePassword = ownProfileRes.data?.must_change_password === true;

  const visibleQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, savedQuickMenu, SANTRI_QUICK_MENU_DEFAULT_KEYS);
  const defaultQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, null, SANTRI_QUICK_MENU_DEFAULT_KEYS);

  const namaPanggilan = profile.fullName.split(" ")[0];
  const avatarUrl = display?.avatarUrl ?? null;

  return (
    <div className="space-y-4">
      {/* Hero sapaan + tanggal & avatar — V57b: lebih tinggi di desktop,
          bukan hanya memanjang horizontal. */}
      <div className="shadow-card relative overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-slate-500/20 dark:bg-card">
        <span aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-50 to-transparent dark:from-emerald-500/10 sm:h-32" />
        <div className="relative flex flex-wrap items-center gap-3 px-5 py-5 sm:min-h-36 sm:px-6 sm:py-7">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Assalamu&apos;alaikum,</p>
            <h1 className="text-xl font-extrabold tracking-tight text-emerald-800 sm:text-2xl dark:text-emerald-300">
              {namaPanggilan} Hebat 🕌
            </h1>
            <p className="text-muted-foreground mt-0.5 max-w-md text-[0.7rem] leading-snug">
              Terus semangat dan menghafal Al-Qur&apos;an — setiap ayat adalah cahaya.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3.5 py-2 dark:border-slate-500/20 dark:bg-transparent">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
                <CalendarDays className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-bold">{hariIniJakarta()}</span>
                <span className="text-muted-foreground block text-[0.62rem]">Semoga hari ini penuh keberkahan</span>
              </span>
            </div>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={profile.fullName}
                className="size-11 rounded-full object-cover ring-2 ring-emerald-100 dark:ring-emerald-500/20"
              />
            ) : (
              <span className="bg-role-soft text-role-strong flex size-11 items-center justify-center rounded-full text-sm font-extrabold ring-2 ring-emerald-100 dark:ring-emerald-500/20">
                {namaPanggilan.charAt(0).toUpperCase()}
              </span>
            )}
            <ChevronDown className="text-muted-foreground hidden size-4 sm:block" />
          </div>
        </div>
      </div>

      {mustChangePassword && <ForceChangePasswordCard />}

      {/* V57 — kartu ringkasan: statistik, modul, kehadiran, motivasi. */}
      {prestasiCards.length > 0 && (
        <SantriHomeCard
          cards={prestasiCards}
          presensi={presensiRekap}
          targets={santriTargets}
          meterTotals={Array.from(meterTotalsMap.values())}
        />
      )}

      {/* Menu Cepat besar (dapat diatur per akun) */}
      <CardBox>
        <SectionTitle
          tone="emerald"
          title="Menu Cepat"
          description="Semua menu ananda ada di sini — pilih salah satu untuk memulai."
          action={
            <QuickMenuEditorButton
              defaults={SANTRI_QUICK_MENU}
              visible={visibleQuickMenu}
              defaultVisible={defaultQuickMenu}
              iconOverrides={iconOverrides}
            />
          }
        />
        <QuickMenuGrid items={visibleQuickMenu} iconOverrides={iconOverrides} large />
      </CardBox>
    </div>
  );
}
