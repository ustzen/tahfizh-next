import { CardBox, SectionTitle } from "@/components/dashboard/section";
import { QuickMenuGrid, QuickMenuEditorButton } from "@/components/dashboard/quick-menu-editor";
import { requireRole } from "@/lib/auth";
import { getDisplayProfile } from "@/lib/layout-data";
import { SANTRI_QUICK_MENU, SANTRI_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";
import { createClient } from "@/lib/supabase/server";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import { SantriDashboard } from "@/components/santri/santri-dashboard";
import {
  getPrestasiCards,
  getPresensiRekap,
  getSantriTargetProgress,
  getMeterTotals,
  getPantauanFeed,
} from "@/lib/santri-pantauan";

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
 * Dasbor Santri — V61 "sky dashboard": hero sapaan, banner biru motivasi,
 * 4 kartu statistik berwarna, aktivitas terbaru, Menu Cepat, progress hafalan
 * (donut), banner ajakan, informasi lembaga, dan kartu kutipan.
 * Semua angka tetap murni dari penilaian guru (RPC V18/V40/V57).
 */
export default async function SantriDashboardPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri");

  const [savedQuickMenu, iconOverrides, prestasiCards, presensiRekap, santriTargets, meterTotalsMap, display, aktivitasFeed] =
    await Promise.all([
      getDashboardQuickMenuOrder(profile.id),
      getMenuIconOverrides(),
      getPrestasiCards(),
      getPresensiRekap(6),
      getSantriTargetProgress(),
      getMeterTotals(),
      getDisplayProfile(),
      getPantauanFeed(null, 8),
    ]);

  const visibleQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, savedQuickMenu, SANTRI_QUICK_MENU_DEFAULT_KEYS);
  const defaultQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, null, SANTRI_QUICK_MENU_DEFAULT_KEYS);

  const prestasi = prestasiCards[0] ?? null;
  const meterTotals = meterTotalsMap.get(prestasi?.studentId ?? "") ?? undefined;

  return (
    <SantriDashboard
      namaSantri={profile.fullName}
      avatarUrl={display?.avatarUrl ?? null}
      tanggalHariIni={hariIniJakarta()}
      prestasi={prestasi}
      presensi={presensiRekap[0] ?? null}
      targets={santriTargets.filter((t) => t.studentId === prestasi?.studentId)}
      meterTotals={meterTotals}
      aktivitas={aktivitasFeed}
      quickMenu={visibleQuickMenu}
      quickMenuDefaults={defaultQuickMenu}
      iconOverrides={iconOverrides}
      customModules={[]}
      customCounts={{}}
      lembagaNama={display?.tenantName ?? null}
      lembagaKode={display?.tenantCode ?? null}
    />
  );
}
