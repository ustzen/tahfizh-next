import { notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getLearningTeacherForSession,
  getLearningStudentAssessments,
  getActiveLearningConfig,
} from "@/lib/learning";
import { getStudentRowForTeacher } from "@/lib/tartil-detail";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { LearningAssessmentForm } from "@/app/ustadz/learning-form";
import { LearningHistoryList } from "@/app/ustadz/learning-history";
import { LEARNING_MODULE_CONFIGS } from "@/lib/learning-shared";

export const metadata = { title: "Detail Doa Harian" };

export default async function StudentDoaPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/doa/${studentId}`);
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getLearningTeacherForSession();
  if (!teacher || !profile.tenantId) notFound();

  const student = await getStudentRowForTeacher(teacher.id, studentId);
  if (!student) notFound();

  const [entries, config] = await Promise.all([
    getLearningStudentAssessments(studentId, "DOA"),
    getActiveLearningConfig(profile.tenantId, "DOA"),
  ]);

  const lulus = entries.filter((e) => e.status === "LULUS").length;
  const latest = entries[0];
  const moduleLabel = LEARNING_MODULE_CONFIGS.DOA.label;

  return (
    <div>
      <PageHeader
        title={student.fullName}
        description={`Riwayat doa harian ${terms.santri.toLowerCase()}`}
        action={
          <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
            <Link href={`/ustadz/prestasi/${studentId}`}>
              <Trophy className="size-4" /> Kartu Prestasi
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="student" label="Total Penilaian" value={entries.length} />
        <StatCard icon="people" label="Lulus" value={lulus} />
        <StatCard
          icon="tenant"
          label="Terakhir"
          value={
            latest
              ? latest.scoreLabel ?? (latest.scoreValue !== null ? String(latest.scoreValue) : "✓")
              : "—"
          }
          hint={latest ? latest.materialTitle : "Belum ada penilaian"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Penilaian {moduleLabel}</CardTitle>
            <CardDescription>
              Mode penilaian lembaga:{" "}
              <Badge variant="outline" className="border-role/25 bg-role-soft font-semibold text-role-strong">
                {config.mode}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LearningAssessmentForm
              module="DOA"
              studentId={studentId}
              mode={config.mode}
              grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
              materials={config.materials.map((m) => ({
                id: m.id,
                title: m.title,
                subtitle: m.subtitle,
                arabicText: m.arabicText,
                translation: m.translation,
              }))}
              templates={config.templates.map((t) => ({ slot: t.slot, content: t.content }))}
            />
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Riwayat {moduleLabel}</CardTitle>
            <CardDescription>Semua penilaian tersimpan — tidak ada yang ditimpa.</CardDescription>
          </CardHeader>
          <CardContent>
            <LearningHistoryList
              module="DOA"
              items={entries.map((e) => ({
                id: e.id,
                materialTitle: e.materialTitle,
                assessedDate: e.assessedDate,
                status: e.status,
                scoreLabel: e.scoreLabel,
                scoreValue: e.scoreValue,
                freeNote: e.freeNote,
                teacherName: e.teacherName,
                notes: e.notes,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
