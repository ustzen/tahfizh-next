import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { QuickMenuEditorButton, QuickMenuGrid } from "@/components/dashboard/quick-menu-editor";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeOnboardingSteps, getActiveSemester, getActiveYear, getOnboarding } from "@/lib/akademik";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import { ADMIN_QUICK_MENU, ADMIN_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Ringkasan" };

async function getDashboardQuickMenuOrder(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("dashboard_quick_menu")
    .eq("id", userId)
    .single();
  return (data?.dashboard_quick_menu as string[] | null) ?? null;
}

export default async function AdminDashboardPage() {
  const profile = await requireRole(["ADMIN"], "/admin");
  const supabase = await createClient();
  const tid = profile.tenantId!;

  const [
    { count: teacherCount },
    { count: studentCount },
    { count: activeStudentCount },
    { count: activeTeacherCount },
    terms,
    year,
    semester,
    steps,
    halaqahList,
    savedQuickMenu,
    iconOverrides,
  ] = await Promise.all([
    supabase.from("teachers").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "ACTIVE"),
    supabase.from("teachers").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "ACTIVE"),
    getTerminology(tid),
    getActiveYear(),
    getActiveSemester(),
    computeOnboardingSteps(),
    getAdminHalaqahList(),
    // V31: preferensi Menu Cepat (urutan + tampil/sembunyi) per akun.
    getDashboardQuickMenuOrder(profile.id),
    // V39: override ikon menu platform.
    getMenuIconOverrides(),
  ]);

  const visibleQuickMenu = resolveQuickMenu(ADMIN_QUICK_MENU, savedQuickMenu, ADMIN_QUICK_MENU_DEFAULT_KEYS);
  // Set 8 item bawaan (sebelum admin mengatur), dipakai editor untuk "Kembalikan Default".
  const defaultQuickMenu = resolveQuickMenu(ADMIN_QUICK_MENU, null, ADMIN_QUICK_MENU_DEFAULT_KEYS);

  // V11 (#28): onboarding reminder until completed/dismissed.
  const onboarding = await getOnboarding();
  const showOnboardingBanner = onboarding !== null && !onboarding.completed && !onboarding.dismissed;

  const activeHalaqah = halaqahList.filter((h) => h.status === "ACTIVE");
  const setupItems = [
    { label: "Tahun ajaran", done: steps.tahunAjaran, href: "/admin/akademik" },
    { label: "Jadwal belajar", done: steps.jadwal, href: "/admin/akademik/jadwal" },
    { label: `Data ${terms.guru.toLowerCase()}`, done: steps.guru, href: "/admin/guru" },
    { label: `Data ${terms.santri.toLowerCase()}`, done: steps.santri, href: "/admin/santri" },
    { label: terms.halaqah, done: steps.halaqah, href: "/admin/halaqah" },
  ];
  const doneCount = setupItems.filter((i) => i.done).length;
  const setupPct = Math.round((doneCount / setupItems.length) * 100);

  return (
    <div>
      <PageHeader
        title={`Assalamu'alaikum, ${profile.fullName.split(" ")[0]} 👋`}
        description="Ringkasan lembaga Anda hari ini."
        icon={<LayoutDashboard className="size-6" />}
      />

      {showOnboardingBanner && (
        <Link
          href="/admin/onboarding"
          className="bg-gradient-brand group mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-sm transition-opacity hover:opacity-95"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Pengaturan lembaga Anda belum selesai.</p>
            <p className="text-sm text-white/90">
              Lanjutkan onboarding — profil, tahun ajaran, jadwal, guru, santri, halaqah, dan raport.
            </p>
          </div>
          <span className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-role-strong group-hover:bg-blue-50">
            Lanjutkan Pengaturan
          </span>
        </Link>
      )}

      {/* Ringkasan angka inti */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="teacher" label={terms.guru} value={teacherCount ?? 0} hint={`${activeTeacherCount ?? 0} aktif`} />
        <StatCard
          icon="student"
          label={terms.santri}
          value={studentCount ?? 0}
          hint={`${activeStudentCount ?? 0} aktif`}
          progress={studentCount ? ((activeStudentCount ?? 0) / studentCount) * 100 : 0}
        />
        <StatCard icon="halaqah" label={terms.halaqah} value={activeHalaqah.length} hint={`${halaqahList.length} terdaftar`} />
        <StatCard
          icon="people"
          label="Rasio"
          value={teacherCount ? Math.round((studentCount ?? 0) / teacherCount) : "—"}
          hint={`${terms.santri.toLowerCase()} per ${terms.guru.toLowerCase()}`}
        />
      </div>

      {/* Tahun ajaran aktif + kesiapan lembaga */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <CardBox>
          <SectionTitle
            tone="blue"
            icon={<CalendarRange />}
            title="Tahun Ajaran Aktif"
            description="Periode belajar yang sedang berjalan"
            action={
              <Link href="/admin/akademik" className="text-role-strong inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                Kelola <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {year ? (
            <div className="mt-4">
              <p className="text-2xl font-bold tracking-tight">{year.name}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {formatDate(year.startDate)} – {formatDate(year.endDate)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="success">Aktif</Badge>
                {semester && <Badge variant="info">{semester.name}</Badge>}
              </div>
            </div>
          ) : (
            <div className="bg-muted/50 mt-4 rounded-xl border border-dashed p-4 text-sm">
              <p className="font-medium">Belum ada tahun ajaran aktif.</p>
              <p className="text-muted-foreground mt-0.5">
                Buat tahun ajaran di menu Akademik agar jadwal dan raport bisa dipakai.
              </p>
            </div>
          )}
        </CardBox>

        <CardBox>
          <SectionTitle
            tone="emerald"
            icon={<CheckCircle2 />}
            title="Kesiapan Lembaga"
            description={`${doneCount} dari ${setupItems.length} langkah dasar selesai`}
            action={<Badge variant={setupPct === 100 ? "success" : "warning"}>{setupPct}%</Badge>}
          />
          <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full" role="progressbar" aria-valuenow={setupPct} aria-valuemin={0} aria-valuemax={100} aria-label="Kesiapan lembaga">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${setupPct}%` }} />
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {setupItems.map((i) => (
              <li key={i.label}>
                <Link
                  href={i.href}
                  className="hover:bg-muted/60 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors"
                >
                  {i.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className={cn(i.done ? "text-foreground" : "text-muted-foreground")}>{i.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBox>
      </div>

      {/* Menu Cepat (V31 — dapat diatur ulang & disembunyikan per akun) */}
      <CardBox className="mt-8">
        <SectionTitle
          tone="blue"
          icon={<LayoutDashboard />}
          title="Menu Cepat"
          description="Akses langsung ke semua modul yang Anda gunakan sehari-hari."
          action={
            <QuickMenuEditorButton
              defaults={ADMIN_QUICK_MENU}
              visible={visibleQuickMenu}
              defaultVisible={defaultQuickMenu}
              iconOverrides={iconOverrides}
            />
          }
        />
        <QuickMenuGrid items={visibleQuickMenu} iconOverrides={iconOverrides} />
      </CardBox>
    </div>
  );
}
