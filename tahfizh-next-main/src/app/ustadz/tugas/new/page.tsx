import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getV7AssignedStudents, getV7TeacherForSession } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TaskForm } from "../task-form";

export const metadata = { title: "Tugas Baru" };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const profile = await requireRole(["USTADZ"], "/ustadz/tugas/new");
  const terms = await getTerminology(profile.tenantId);

  const teacher = await getV7TeacherForSession();
  if (!teacher) notFound();

  const students = await getV7AssignedStudents();

  return (
    <div>
      <PageHeader
        title="Tugas Baru"
        description={`Beri tugas pembelajaran kepada ${terms.santri.toLowerCase()} halaqah Anda.`}
      />
      <TaskForm students={students} mode="create" defaultStudentId={student} />
    </div>
  );
}
