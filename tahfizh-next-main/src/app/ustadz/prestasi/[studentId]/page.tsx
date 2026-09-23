import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTartilTeacherForSession, getAchievementTimeline } from "@/lib/tartil";
import { getStudentRowForTeacher } from "@/lib/tartil-detail";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AchievementTimeline } from "@/app/ustadz/prestasi/[studentId]/achievement-timeline";

export const metadata = { title: "Kartu Prestasi" };

export default async function KartuPrestasiPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/prestasi/${studentId}`);
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getTartilTeacherForSession();
  if (!teacher) notFound();
  const student = await getStudentRowForTeacher(teacher.id, studentId);
  if (!student) notFound();

  const entries = await getAchievementTimeline(studentId, "ALL");
  if (entries === null) notFound();

  return (
    <div>
      <PageHeader
        title="Kartu Prestasi"
        description={`${student.fullName} — rekam perkembangan otomatis dari penilaian guru.`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/ustadz/tartil/${studentId}`}>
              <ArrowLeft className="size-4" /> Kembali ke Tartil
            </Link>
          </Button>
        }
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-5 py-5">
          <AchievementTimeline entries={entries} santriLabel={terms.santri} />
        </CardContent>
      </Card>
    </div>
  );
}
