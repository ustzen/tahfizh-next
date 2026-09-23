import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getJournalTeacherTemplates, getV7AssignedStudents, getV7TeacherForSession } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { JournalForm } from "../journal-form";

export const metadata = { title: "Tulis Jurnal" };

export default async function IsiJurnalPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const profile = await requireRole(["USTADZ"], "/ustadz/jurnal/isi");
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getV7TeacherForSession();
  if (!teacher) notFound();

  const [templates, students] = await Promise.all([
    getJournalTeacherTemplates(),
    getV7AssignedStudents(),
  ]);

  return (
    <div>
      <PageHeader
        title="Tulis Jurnal"
        description={`Pilih template, isi field yang disediakan Admin, lalu simpan (rule #29).`}
      />
      <JournalForm templates={templates} students={students} defaultStudentId={student} />
    </div>
  );
}
