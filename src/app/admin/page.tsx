import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Sparkles,
  Users2,
} from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeOnboardingSteps, getActiveSemester, getActiveYear, getOnboarding } from "@/lib/akademik";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Ringkasan" };

/** Menu cepat dengan warna aksen unik per kartu (V12 — full color). */
const QUICK_LINKS = [
  {
    href: "/admin/guru",
    label: "Guru",
    hint: "Kelola data guru",
    icon: BookOpenCheck,
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    strip: "bg-amber-400",
  },
  {
    href: "/admin/santri",
    label: "Santri",
    hint: "Kelola data santri",
    icon: GraduationCap,
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    strip: "bg-emerald-500",
  },
  {
    href: "/admin/halaqah",
    label: "Halaqah",
    hint: "Pengampu & anggota",
    icon: Users2,
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    strip: "bg-indigo-500",
  },
  {
    href: "/admin/akademik",
    label: "Akademik",
    hint: "Tahun ajaran & jadwal",
    icon: CalendarRange,
    chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    strip: "bg-cyan-500",
  },
  {
    href: "/admin/raport",
    label: "Raport",
    hint: "Template & cetak",
    icon: FileText,
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    strip: "bg-violet-500",
  },
  {
    href: "/admin/saran",
    label: "Kritik & Saran",
    hint: "Masukan dari pengguna",
    icon: MessageSquareText,
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    strip: "bg-rose-500",
  },
  {
    href: "/admin/pengaturan",
    label: "Pengaturan",
    hint: "Profil & konfigurasi",
    icon: Settings,
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    strip: "bg-blue-500",
  },
] as const;

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
  ]);

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

      {/* Menu cepat */}
      <h3 className="text-muted-foreground mt-8 mb-3 text-sm font-bold">Menu cepat</h3>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {QUICK_LINKS.map(({ href, label, hint, icon: Icon, chip, strip }) => (
          <Link
            key={href}
            href={href}
            className="shadow-card hover:shadow-card-lg group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-0.5"
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", strip)} />
            <span className="flex flex-col items-start gap-3 px-5 py-5 pl-6">
              <span className={cn("flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105", chip)}>
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="text-muted-foreground block text-xs">{hint}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
