import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getJournalEntryDetail, getJournalTeacherTemplates, getV7AssignedStudents } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { JournalForm } from "../../journal-form";

export const metadata = { title: "Edit Jurnal" };

export default async function EditJurnalPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/jurnal/${entryId}/edit`);
  const terms = await getTerminology(profile.tenantId);

  const [entry, templates, students] = await Promise.all([
    getJournalEntryDetail(entryId),
    getJournalTeacherTemplates(),
    getV7AssignedStudents(),
  ]);
  if (!entry) notFound();

  return (
    <div>
      <PageHeader
        title="Edit Jurnal"
        description={`${entry.templateName} — ${entry.studentName}.`}
      />
      <JournalForm
        templates={templates}
        students={students}
        entry={{
          id: entry.id,
          templateId: entry.templateId,
          studentId: entry.studentId,
          entryDate: entry.entryDate,
          freeText: entry.freeText,
          valuesJson: entry.valuesJson,
        }}
      />
    </div>
  );
}
