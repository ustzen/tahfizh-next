import { notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getSetoranTeacherForSession,
  getStudentSubmissions,
  getActiveSetoranConfig,
  getSetoranModuleConfig,
} from "@/lib/setoran";
import { getStudentRowForTeacher } from "@/lib/tartil-detail";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { SetoranMultiForm } from "@/app/ustadz/setoran/[studentId]/setoran-form";
import { SetoranHistoryList } from "@/app/ustadz/setoran/[studentId]/history-list";
import { SetoranFilterBar } from "@/app/ustadz/setoran/[studentId]/filter-bar";
import { SUBMISSION_FILTERS, type SubmissionFilter } from "@/lib/setoran-shared";

export const metadata = { title: "Detail Setoran" };

export default async function StudentSetoranPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { studentId } = await params;
  const { filter } = await searchParams;
  const profile = await requireRole(["USTADZ"], `/ustadz/setoran/${studentId}`);
  const terms = await getTerminology(profile.tenantId);

  const { teacher, surahs } = await getSetoranTeacherForSession();
  if (!teacher || !profile.tenantId) notFound();

  // RLS + assignment check: student must be one of this teacher's students.
  const student = await getStudentRowForTeacher(teacher.id, studentId);
  if (!student) notFound();

  const activeFilter: SubmissionFilter = (SUBMISSION_FILTERS as readonly string[]).includes(filter ?? "")
    ? (filter as SubmissionFilter)
    : "ALL";

  const [entries, config, hadits, doa] = await Promise.all([
    getStudentSubmissions(studentId, activeFilter),
    getActiveSetoranConfig(profile.tenantId),
    // V12.11 — config 3 tab setoran (materi & template per modul).
    getSetoranModuleConfig(profile.tenantId, "HADITS"),
    getSetoranModuleConfig(profile.tenantId, "DOA"),
  ]);

  const lulus = entries.filter((e) => e.result === "LULUS").length;
  const latest = entries[0];

  return (
    <div>
      <PageHeader
        title={student.fullName}
        description={`Riwayat setoran ${terms.santri.toLowerCase()}`}
        action={
          <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
            <Link href={`/ustadz/prestasi/${studentId}`}>
              <Trophy className="size-4" /> Kartu Prestasi
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="student" label="Total Setoran" value={entries.length} />
        <StatCard icon="people" label="Lulus" value={lulus} />
        <StatCard
          icon="tenant"
          label="Terakhir"
          value={
            latest
              ? latest.scoreLabel ?? (latest.scoreValue !== null ? String(latest.scoreValue) : "✓")
              : "—"
          }
          hint={
            latest
              ? `${latest.surahName}${latest.ayatLabel ? ` · ${latest.ayatLabel}` : ""}`
              : "Belum ada setoran"
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Setoran Baru</CardTitle>
            <CardDescription>
              Mode penilaian lembaga:{" "}
              <Badge variant="outline" className="border-role/25 bg-role-soft font-semibold text-role-strong">
                {config.mode}
              </Badge>
              {" · "}Tanggal default hari ini; sesuaikan jika perlu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetoranMultiForm
              studentId={studentId}
              surahs={surahs}
              haditsMaterials={hadits.materials}
              doaMaterials={doa.materials}
              grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
              defaultMode={config.mode}
              templatesByTab={{
                TAHFIDZ: config.templates.map((t) => ({ slot: t.slot, content: t.content })),
                HADITS: hadits.templates,
                DOA: doa.templates,
              }}
            />
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Riwayat Setoran</CardTitle>
            <CardDescription>Setiap setoran tersimpan sebagai histori — tidak ada yang ditimpa.</CardDescription>
          </CardHeader>
          <CardContent>
            <SetoranHistoryList
              items={entries.map((e) => ({
                id: e.id,
                kind: e.kind,
                ayatLabel: e.ayatLabel,
                assessedDate: e.assessedDate,
                result: e.result,
                scoreLabel: e.scoreLabel,
                scoreValue: e.scoreValue,
                freeNote: e.freeNote,
                teacherName: e.teacherName,
                surahName: e.surahName,
                notes: e.notes,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* Rule #24: filter chips — ?filter= keeps filtering server-side while
          navigation stays a fast client-side transition (no reload). */}
      <SetoranFilterBar studentId={studentId} activeFilter={activeFilter} />
    </div>
  );
}
