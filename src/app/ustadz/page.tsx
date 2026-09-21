import { Activity, AudioLines, BookOpenText, ClipboardList, GraduationCap, HandHeart, Info, LayoutDashboard, SpellCheck, Target, ListChecks, NotebookPen } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getLearningTeacherForSession, getTeacherTodayActivity, type TodayActivity } from "@/lib/learning";
import { getTeacherStudentsDetailed } from "@/lib/teacher-students";
import { getV7TeacherCounts } from "@/lib/v7";
import { getTeacherV8Dashboard } from "@/lib/halaqah";
import { getScheduleReminders } from "@/lib/schedule-reminder";
import { getTerminology } from "@/lib/terminology";
import { ScheduleReminderBanner } from "@/components/dashboard/schedule-reminder-banner";
import { WaChatButton } from "@/components/santri/wa-chat-button";

type StudentRow = {
  nis: string | null;
  nisn: string | null;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  guardian_name: string | null;
  guardian_whatsapp: string | null;
  halaqah_name: string | null;
};

const TODAY_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; href: string; chip: string }> = {
  SETORAN: { icon: ClipboardList, label: "Setoran", href: "/ustadz/setoran", chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  TARTIL: { icon: AudioLines, label: "Tartil", href: "/ustadz/tartil", chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" },
  HADITS: { icon: BookOpenText, label: "Hadits", href: "/ustadz/hadits", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  DOA: { icon: HandHeart, label: "Doa", href: "/ustadz/doa", chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  TAJWID: { icon: SpellCheck, label: "Tajwid", href: "/ustadz/tajwid", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export const metadata = { title: "Dashboard Ustadz" };

export default async function UstadzDashboardPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz");

  // Guru modul pembelajaran + terminologi tenant (untuk sapaan ustadz/ustadzah).
  const [learningTeacher, terms] = await Promise.all([
    getLearningTeacherForSession(),
    getTerminology(profile.tenantId),
  ]);

  // Sapaan: tambahkan gelar Ustadz/Ustadzah sesuai gender & terminologi tenant.
  const honorific = profile.gender === "P" ? terms.ustadzah || "Ustadzah" : terms.ustadz || "Ustadz";
  const greetingName = `${honorific} ${profile.fullName.split(" ")[0]}`;

  // Semua data dasbor selanjutnya paralel (rule #27 + V8 + V12.10).
  const [today, v7Counts, v8Stats, students, reminders] = await Promise.all([
    learningTeacher ? getTeacherTodayActivity(learningTeacher.id) : Promise.resolve([]),
    learningTeacher ? getV7TeacherCounts(learningTeacher.id) : Promise.resolve({ targets: 0, tasks: 0, journals: 0 }),
    // V8 (rule #39): halaqah saya + presensi hari ini + rata-rata capaian.
    getTeacherV8Dashboard(),
    // V12.10: Data Santri (kolom lengkap) via helper bersama — RPC
    // `teacher_students_list` + fallback jalur halaqah bila RPC kosong/gagal.
    getTeacherStudentsDetailed(),
    // V12.13: pengingat sesi halaqah hari ini & besok (H-1).
    getScheduleReminders(),
  ]);

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
          icon={<GraduationCap />}
          title="Data Santri Halaqah Saya"
          description="NIS, NISN, nama, panggilan, gender, halaqah, wali, dan No. WA wali."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/ustadz/santri">Detail Santri</Link>
            </Button>
          }
        />
        {students.length > 0 ? (
          <div className="mt-4 -mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-3">No.</TableHead>
                  <TableHead className="px-5">NIS</TableHead>
                  <TableHead>NISN</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Panggilan</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Halaqah</TableHead>
                  <TableHead>Wali</TableHead>
                  <TableHead>No. WA Wali</TableHead>
                  <TableHead>WA</TableHead>
                  <TableHead className="px-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s, i) => (
                  <TableRow key={s.nis ?? s.full_name} className="border-border/60">
                    <TableCell className="px-3 text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="px-5 font-mono text-xs text-muted-foreground">{s.nis ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.nisn ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="bg-role-soft text-role-strong flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                          {s.full_name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                        <span className="font-medium text-foreground">{s.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.nickname || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.gender === "L" ? "info" : "violet"}>{s.gender === "L" ? "Laki-laki" : "Perempuan"}</Badge>
                    </TableCell>
                    <TableCell>
                      {s.halaqah_name ? <Badge variant="role">{s.halaqah_name}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.guardian_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.guardian_whatsapp ?? "—"}</TableCell>
                    <TableCell>
                      <WaChatButton
                        number={s.guardian_whatsapp}
                        studentName={s.full_name}
                        senderLabel="ustadz/ustadzah halaqah"
                      />
                    </TableCell>
                    <TableCell className="px-5">
                      <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"}>
                        {s.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Belum ada santri di halaqah yang Anda ampu. Pastikan admin sudah menetapkan Anda
            sebagai pengampu halaqah.
          </p>
        )}
      </CardBox>

      <CardBox className="mt-4">
        <SectionTitle
          tone="orange"
          icon={<Activity />}
          title="Aktivitas Hari Ini"
          description="Catatan yang Anda simpan hari ini di semua modul pembelajaran."
        />
        {today.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {today.map((t) => (
              <TodayChip key={t.module} activity={t} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Belum ada aktivitas hari ini. Mulai dengan membuka menu Tahfidz, Tartil, Setoran,
            Hadits, Doa, atau Tajwid.
          </p>
        )}
      </CardBox>

      {/* Rule #34: Target(halaqah)/Tugas/Jurnal widget — real data only. */}
      <CardBox className="mt-4">
        <SectionTitle
          tone="violet"
          icon={<Target />}
          title="Target, tugas & jurnal"
          description="Ringkasan pekerjaan Anda yang masih berjalan."
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <WidgetLink
            href="/ustadz/target"
            icon={<Target className="size-5" />}
            iconClass="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
            label="Target Halaqah Aktif"
            value={v7Counts.targets}
          />
          <WidgetLink
            href="/ustadz/tugas"
            icon={<ListChecks className="size-5" />}
            iconClass="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
            label="Tugas Aktif"
            value={v7Counts.tasks}
          />
          <WidgetLink
            href="/ustadz/jurnal"
            icon={<NotebookPen className="size-5" />}
            iconClass="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
            label="Jurnal (30 hari)"
            value={v7Counts.journals}
          />
        </div>
      </CardBox>

      <CardBox className="mt-4">
        <SectionTitle
          tone="sky"
          icon={<Info />}
          title="Tentang penugasan"
          description="Anda melihat santri dari halaqah yang Anda ampu — satu guru bisa mengampu lebih dari satu halaqah. Jika data belum muncul, pastikan admin sudah menetapkan Anda sebagai pengampu halaqah."
        />
      </CardBox>
    </div>
  );
}

function TodayChip({ activity }: { activity: TodayActivity }) {
  const meta = TODAY_ICONS[activity.module];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Link
      href={meta.href}
      prefetch
      className="rounded-xl border border-slate-200/80 bg-card p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-lg"
    >
      <div className="flex items-center gap-2">
        <span className="bg-gradient-brand flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-[0.7rem] font-medium">{meta.label}</p>
          <p className="text-lg font-bold leading-tight">{activity.todayCount}</p>
        </div>
      </div>
    </Link>
  );
}

function WidgetLink({
  href,
  icon,
  iconClass,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      prefetch
      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-card p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-lg"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        <p className="tabular text-xl font-bold leading-tight">{value}</p>
      </div>
    </Link>
  );
}
