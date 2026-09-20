import { notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getTartilTeacherForSession,
  getTartilStudentAssessments,
  getActiveTartilConfig,
} from "@/lib/tartil";
import { getStudentRowForTeacher } from "@/lib/tartil-detail";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { TartilAssessmentForm } from "@/app/ustadz/tartil/[studentId]/tartil-form";
import { TartilHistoryList } from "@/app/ustadz/tartil/[studentId]/history-list";

export const metadata = { title: "Detail Tartil" };

export default async function StudentTartilPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/tartil/${studentId}`);
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getTartilTeacherForSession();
  if (!teacher || !profile.tenantId) notFound();

  // RLS + assignment check: student must be one of this teacher's students.
  const student = await getStudentRowForTeacher(teacher.id, studentId);
  if (!student) notFound();

  const [entries, config] = await Promise.all([
    getTartilStudentAssessments(studentId),
    getActiveTartilConfig(profile.tenantId),
  ]);

  const dinilai = entries.filter((e) => e.status === "DINILAI").length;
  const latest = entries[0];

  return (
    <div>
      <PageHeader
        title={student.fullName}
        description={`Penilaian Tartil ${terms.santri.toLowerCase()}`}
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
        <StatCard icon="teacher" label="Sudah Dinilai" value={dinilai} />
        <StatCard
          icon="tenant"
          label="Terakhir"
          value={
            latest
              ? latest.scoreLabel ?? (latest.scoreValue !== null ? String(latest.scoreValue) : "✓")
              : "—"
          }
          hint={latest ? `${latest.materialName}${latest.pagesLabel ? ` · Hal. ${latest.pagesLabel}` : ""}` : "Belum dinilai"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Penilaian Tartil</CardTitle>
            <CardDescription>
              Mode penilaian lembaga:{" "}
              <Badge variant="outline" className="border-role/25 bg-role-soft font-semibold text-role-strong">
                {config.mode}
              </Badge>
              {latest ? " · Mengedit akan menambah histori baru, tidak menimpa." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TartilAssessmentForm
              studentId={studentId}
              mode={config.mode}
              grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
              materials={config.materials.map((m) => ({
                id: m.id,
                name: m.name,
                pagesLabel: m.pagesLabel,
              }))}
              templates={config.templates.map((t) => ({ slot: t.slot, content: t.content }))}
            />
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Histori Penilaian</CardTitle>
            <CardDescription>Semua penilaian tersimpan — tidak ada yang ditimpa.</CardDescription>
          </CardHeader>
          <CardContent>
            <TartilHistoryList
              items={entries.map((e) => ({
                id: e.id,
                materialName: e.materialName,
                pagesLabel: e.pagesLabel,
                assessedAt: e.assessedAt,
                status: e.status,
                scoreLabel: e.scoreLabel,
                scoreValue: e.scoreValue,
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
