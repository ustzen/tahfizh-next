import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { QuickMenuEditorButton, QuickMenuGrid } from "@/components/dashboard/quick-menu-editor";
import { requireRole } from "@/lib/auth";
import { getTeacherV8Dashboard } from "@/lib/halaqah";
import { getScheduleReminders } from "@/lib/schedule-reminder";
import { getTerminology } from "@/lib/terminology";
import { createClient } from "@/lib/supabase/server";
import { USTADZ_QUICK_MENU, USTADZ_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";
import { ScheduleReminderBanner } from "@/components/dashboard/schedule-reminder-banner";

export const metadata = { title: "Dashboard Ustadz" };

async function getDashboardQuickMenuOrder(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("dashboard_quick_menu")
    .eq("id", userId)
    .single();
  return (data?.dashboard_quick_menu as string[] | null) ?? null;
}

export default async function UstadzDashboardPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz");

  // Terminologi tenant (untuk sapaan ustadz/ustadzah).
  const terms = await getTerminology(profile.tenantId);

  // Sapaan: tambahkan gelar Ustadz/Ustadzah sesuai gender & terminologi tenant.
  const honorific = profile.gender === "P" ? terms.ustadzah || "Ustadzah" : terms.ustadz || "Ustadz";
  const greetingName = `${honorific} ${profile.fullName.split(" ")[0]}`;

  // V8 (rule #39): halaqah saya + presensi hari ini + rata-rata capaian.
  const [v8Stats, reminders, savedQuickMenu] = await Promise.all([
    getTeacherV8Dashboard(),
    // V12.13: pengingat sesi halaqah hari ini & besok (H-1).
    getScheduleReminders(),
    // V31: preferensi Menu Cepat (urutan + tampil/sembunyi) per akun.
    getDashboardQuickMenuOrder(profile.id),
  ]);

  const visibleQuickMenu = resolveQuickMenu(USTADZ_QUICK_MENU, savedQuickMenu, USTADZ_QUICK_MENU_DEFAULT_KEYS);
  // Set 8 item bawaan (sebelum guru mengatur), dipakai editor untuk "Kembalikan Default".
  const defaultQuickMenu = resolveQuickMenu(USTADZ_QUICK_MENU, null, USTADZ_QUICK_MENU_DEFAULT_KEYS);

  return (
    <div>
      <PageHeader
        title={`Assalamu'alaikum, ${greetingName} 👋`}
        description="Ringkasan aktivitas mengajar Anda."
        icon={<LayoutDashboard className="size-6" />}
        action={
          <Button asChild variant="role">
            <Link href="/ustadz/santri">Lihat Santri Halaqah Saya</Link>
          </Button>
        }
      />

      {reminders.length > 0 && <ScheduleReminderBanner reminders={reminders} />}

      {/* V8 (rule #39) + V25: hanya 4 kartu inti, 2 kolom di mobile. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon="halaqah" label="Halaqah" value={v8Stats.halaqah} hint="halaqah diampu" />
        <StatCard icon="people" label="Santri Halaqah" value={v8Stats.students} hint="anggota halaqah Anda" />
        <StatCard
          icon="attendance"
          label="Presensi Hari Ini"
          value={v8Stats.totalToday > 0 ? `${v8Stats.presentToday}/${v8Stats.totalToday}` : "—"}
          hint="hadir / dicatat"
        />
        <StatCard
          icon="achievement"
          label="Rata-Rata Capaian Halaqah"
          value={v8Stats.avgAchievement !== null ? `${v8Stats.avgAchievement}%` : "—"}
          hint="rata-rata capaian santri"
        />
      </div>

      <CardBox className="mt-6">
        <SectionTitle
          tone="emerald"
          icon={<LayoutDashboard />}
          title="Menu Cepat"
          description="Akses langsung ke semua modul yang Anda gunakan sehari-hari."
          action={
            <QuickMenuEditorButton
              defaults={USTADZ_QUICK_MENU}
              visible={visibleQuickMenu}
              defaultVisible={defaultQuickMenu}
            />
          }
        />
        <QuickMenuGrid items={visibleQuickMenu} />
      </CardBox>
    </div>
  );
}
