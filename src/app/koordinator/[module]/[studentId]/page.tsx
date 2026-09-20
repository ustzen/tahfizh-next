import { notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getLearningStudentAssessments,
  getActiveLearningConfig,
  type LearningModule,
} from "@/lib/learning";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { LearningAssessmentForm } from "@/app/ustadz/learning-form";
import { LearningHistoryList } from "@/app/ustadz/learning-history";
import { LEARNING_MODULE_CONFIGS } from "@/lib/learning-shared";

/**
 * TAHFIZH V12.7 — Halaman penilaian Hadits/Doa untuk KOORDINATOR.
 * Daftar & form memakai komponen yang sama dengan guru; RPC v2 memverifikasi
 * role KOORDINATOR + tenant. Mode penilaian bebas dipilih di form.
 */
export default async function KoordinatorLearningStudentPage({
  params,
}: {
  params: Promise<{ module: string; studentId: string }>;
}) {
  const { module: moduleParam, studentId } = await params;
  if (moduleParam !== "hadits" && moduleParam !== "doa") notFound();
  const mod: LearningModule = moduleParam === "hadits" ? "HADITS" : "DOA";

  const profile = await requireRole(
    ["KOORDINATOR"],
    `/koordinator/${moduleParam}/${studentId}`
  );
  const terms = await getTerminology(profile.tenantId);
  if (!profile.tenantId) notFound();

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("business_code, full_name")
    .eq("id", studentId)
    .eq("tenant_id", profile.tenantId)
    .maybeSingle();
  if (!student) notFound();

  const [entries, config] = await Promise.all([
    getLearningStudentAssessments(studentId, mod),
    getActiveLearningConfig(profile.tenantId, mod),
  ]);

  const lulus = entries.filter((e) => e.status === "LULUS" || e.status === "MENGUASAI").length;
  const latest = entries[0];
  const moduleLabel = LEARNING_MODULE_CONFIGS[mod].label;
  const backHref = moduleParam === "hadits" ? "/koordinator/hadits" : "/koordinator/doa";

  return (
    <div>
      <PageHeader
        title={student.full_name}
        description={`Riwayat ${moduleLabel.toLowerCase()} ${terms.santri.toLowerCase()}`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href={backHref}>Kembali ke Daftar</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href="/ustadz/prestasi" aria-hidden>
                <Trophy className="size-4" /> Kartu Prestasi
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="student" label="Total Penilaian" value={entries.length} />
        <StatCard icon="people" label="Lulus / Menguasai" value={lulus} />
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
              Mode default lembaga:{" "}
              <Badge variant="outline" className="border-role/25 bg-role-soft font-semibold text-role-strong">
                {config.mode}
              </Badge>{" "}
              — bebas diganti per penilaian (Centang / Huruf / Angka).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LearningAssessmentForm
              module={mod}
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
              module={mod}
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
