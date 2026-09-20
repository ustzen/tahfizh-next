import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getTargetDetail, getV7AssignedStudents } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TargetForm } from "../../target-form";

export const metadata = { title: "Edit Target" };

export default async function EditTargetPage({
  params,
}: {
  params: Promise<{ targetId: string }>;
}) {
  const { targetId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/target/${targetId}/edit`);
  const terms = await getTerminology(profile.tenantId);

  const [target, students] = await Promise.all([getTargetDetail(targetId), getV7AssignedStudents()]);
  if (!target) notFound();

  return (
    <div>
      <PageHeader title="Edit Target" description={`${target.title} — ${target.studentName}.`} />
      <TargetForm
        mode="edit"
        students={students}
        target={{
          id: target.id,
          studentId: target.studentId,
          moduleType: target.moduleType,
          title: target.title,
          description: target.description,
          startDate: target.startDate,
          endDate: target.endDate,
          targetValue: target.targetValue,
          unit: target.unit,
          note: target.note,
        }}
      />
    </div>
  );
}
