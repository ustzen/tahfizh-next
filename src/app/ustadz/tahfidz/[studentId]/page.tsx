import { notFound } from "next/navigation";
import Link from "next/link";
import { ClipboardList, Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTeacherForSession, getStudentTahfidzDetail, getActiveTahfidzConfig, type TahfidzMode } from "@/lib/tahfidz";
import { getLearningModuleCounts } from "@/lib/learning";
import { getV7StudentSummary } from "@/lib/v7";
import { getStudentAttendanceSummary } from "@/lib/halaqah";
import { LEARNING_MODULE_CONFIGS } from "@/lib/learning-shared";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { AssessmentForm } from "@/app/ustadz/tahfidz/[studentId]/assessment-form";
import { HistoryList } from "@/app/ustadz/tahfidz/[studentId]/history-list";
import { scoreDisplay } from "@/lib/tahfidz";
import { fmtDMY } from "@/lib/date-format";

export const metadata = { title: "Detail Tahfidz" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return fmtDMY(iso);
}

export default async function StudentTahfidzPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/tahfidz/${studentId}`);
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getTeacherForSession();
  if (!teacher || !profile.tenantId) notFound();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;

  const [detail, config, learningCounts, v7Summary, kehadiran] = await Promise.all([
    getStudentTahfidzDetail(teacher.id, studentId),
    getActiveTahfidzConfig(profile.tenantId),
    getLearningModuleCounts(studentId),
    getV7StudentSummary(studentId),
    // V8 (rule #38): Kehadiran bulan berjalan dari data presensi aktual.
    getStudentAttendanceSummary(studentId, monthStart, monthEnd),
  ]);
  if (!detail) notFound();

  const { student, assessments, activeSurahs, history } = detail;

  // Rule #41 — stats based on ACTIVE tenant surahs only.
  const totalActive = activeSurahs.length;
  const bySurah = new Map(assessments.map((a) => [a.tenantSurahId, a]));
  const selesai = activeSurahs.filter((s) => bySurah.get(s.id)?.status === "DINILAI").length;
  const dipelajari = activeSurahs.filter((s) => bySurah.get(s.id)?.status === "DIPELAJARI").length;
  const belum = totalActive - selesai - dipelajari;

  const latest = assessments.find((a) => a.status === "DINILAI");

  return (
    <div>
      <PageHeader
        title={student.full_name}
        description={`Detail tahfidz ${terms.santri.toLowerCase()}`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href={`/ustadz/setoran/${studentId}`}>
                <ClipboardList className="size-4" /> Setoran
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href={`/ustadz/prestasi/${studentId}`}>
                <Trophy className="size-4" /> Kartu Prestasi
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="student" label="Selesai" value={selesai} hint={`dari ${totalActive} surat aktif`} />
        <StatCard icon="teacher" label="Sedang Dipelajari" value={dipelajari} />
        <StatCard icon="people" label="Belum" value={belum} />
        <StatCard
          icon="tenant"
          label="Penilaian Terakhir"
          value={latest ? scoreDisplay(latest.mode ?? config.mode, latest) : "—"}
          hint={latest ? `${latest.surahName} · ${formatDate(latest.assessedAt)}` : "Belum dinilai"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Beri Penilaian</CardTitle>
              <CardDescription>
                Mode penilaian lembaga:{" "}
                <Badge variant="outline" className="border-role/25 bg-role-soft font-semibold text-role-strong">
                  {config.mode}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssessmentForm
                studentId={student.id}
                mode={config.mode as TahfidzMode}
                surahs={activeSurahs.map((s) => {
                  const row = s as unknown as {
                    id: string;
                    name_override: string | null;
                    tahfidz_surahs: { name: string } | { name: string }[] | null;
                  };
                  const master = Array.isArray(row.tahfidz_surahs) ? row.tahfidz_surahs[0] : row.tahfidz_surahs;
                  return { id: row.id, name: row.name_override ?? master?.name ?? "Surat" };
                })}
                grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
                existing={assessments.map((a) => ({
                  tenantSurahId: a.tenantSurahId,
                  status: a.status,
                  scoreLabel: a.scoreLabel,
                  scoreValue: a.scoreValue,
                  note: a.note,
                }))}
              />
            </CardContent>
          </Card>

          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Surat yang Sudah Dinilai</CardTitle>
              <CardDescription>Nilai per surat berdasarkan mode penilaian lembaga.</CardDescription>
            </CardHeader>
            <CardContent>
              {assessments.length > 0 ? (
                <ul className="divide-y">
                  {assessments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{a.surahName}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatDate(a.assessedAt)}
                          {a.note ? ` · ${a.note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.status === "DIPELAJARI" && (
                          <Badge variant="outline" className="border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Dipelajari
                          </Badge>
                        )}
                        {a.status === "DINILAI" && (
                          <span className="inline-flex items-center rounded-lg bg-gradient-brand px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                            {scoreDisplay(a.mode ?? config.mode, a)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Belum ada surat yang dinilai.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {learningCounts.length > 0 && (
            <Card className="shadow-card rounded-2xl">
              <CardHeader>
                <CardTitle>Perkembangan Pembelajaran</CardTitle>
                <CardDescription>Aktivitas modul pembelajaran santri ini.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {learningCounts.map((c) => {
                    const cfg = LEARNING_MODULE_CONFIGS[c.module as keyof typeof LEARNING_MODULE_CONFIGS];
                    return (
                      <li key={c.module}>
                        <Link
                          href={cfg ? `${cfg.href}/${studentId}` : "#"}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-slate-50/60 px-3 py-2 text-sm transition hover:border-role/30 hover:bg-role-soft"
                        >
                          <span className="font-medium text-foreground/85">{cfg?.label ?? c.module}</span>
                          <span className="text-muted-foreground text-xs font-semibold">
                            {c.materialCount} materi · {c.assessmentCount} penilaian
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {v7Summary && (v7Summary.activeTasks > 0 || v7Summary.journalMonth > 0) && (
            <Card className="shadow-card rounded-2xl">
              <CardHeader>
                <CardTitle>Tugas & Jurnal</CardTitle>
                <CardDescription>Ringkasan V7 — data aktual, bukan angka dummy.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-orange-50 dark:bg-orange-500/15 px-2 py-3">
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{v7Summary.activeTasks}</p>
                    <p className="text-muted-foreground text-[11px]">Tugas aktif</p>
                  </div>
                  <div className="rounded-xl bg-violet-50 dark:bg-violet-500/15 px-2 py-3">
                    <p className="text-lg font-bold text-violet-700 dark:text-violet-300">{v7Summary.journalMonth}</p>
                    <p className="text-muted-foreground text-[11px]">Jurnal bulan ini</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/ustadz/tugas/new?student=${studentId}`}
                    className="rounded-lg border border-role/25 px-3 py-1.5 text-xs font-semibold text-role-strong transition hover:bg-role-soft"
                  >
                    + Tugas Baru
                  </Link>
                  <Link
                    href="/ustadz/jurnal/isi"
                    className="rounded-lg border border-role/25 px-3 py-1.5 text-xs font-semibold text-role-strong transition hover:bg-role-soft"
                  >
                    + Tulis Jurnal
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* V8 (rule #38): Kehadiran bulan berjalan — data aktual. */}
          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Kehadiran</CardTitle>
              <CardDescription>
                Presensi halaqah bulan ini (H {kehadiran.hadir} · I {kehadiran.izin} · S {kehadiran.sakit} · A {kehadiran.alpa}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 px-2 py-2.5">
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{kehadiran.hadir}</p>
                  <p className="text-muted-foreground text-[11px]">Hadir</p>
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 px-2 py-2.5">
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{kehadiran.izin}</p>
                  <p className="text-muted-foreground text-[11px]">Izin</p>
                </div>
                <div className="rounded-xl bg-sky-50 dark:bg-sky-500/15 px-2 py-2.5">
                  <p className="text-lg font-bold text-sky-700 dark:text-sky-300">{kehadiran.sakit}</p>
                  <p className="text-muted-foreground text-[11px]">Sakit</p>
                </div>
                <div className="rounded-xl bg-red-50 dark:bg-red-500/15 px-2 py-2.5">
                  <p className="text-lg font-bold text-red-700 dark:text-red-300">{kehadiran.alpa}</p>
                  <p className="text-muted-foreground text-[11px]">Alpa</p>
                </div>
              </div>
              <p className="text-muted-foreground mt-2.5 text-xs">
                Persentase kehadiran: <span className="font-bold text-role-strong">{kehadiran.persen}%</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Riwayat Penilaian</CardTitle>
              <CardDescription>50 perubahan terakhir (termasuk konversi mode).</CardDescription>
            </CardHeader>
            <CardContent>
              <HistoryList
                items={history.map((h) => ({
                  id: h.id,
                  surahName: h.surahName,
                  scoreLabel: h.scoreLabel,
                  scoreValue: h.scoreValue,
                  status: h.status,
                  changeKind: h.changeKind,
                  createdAt: h.createdAt,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
