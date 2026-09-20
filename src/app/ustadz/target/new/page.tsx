import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getV7AssignedStudents, getV7TeacherForSession } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TargetForm } from "../target-form";

export const metadata = { title: "Target Baru" };

export default async function NewTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const profile = await requireRole(["USTADZ"], "/ustadz/target/new");
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getV7TeacherForSession();
  if (!teacher) notFound();

  const students = await getV7AssignedStudents();

  return (
    <div>
      <PageHeader
        title="Target Baru"
        description={`Tentukan capaian untuk ${terms.santri.toLowerCase()} halaqah Anda.`}
      />
      <TargetForm students={students} mode="create" defaultStudentId={student} />
    </div>
  );
}
