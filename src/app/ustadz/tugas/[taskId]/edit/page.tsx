import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getTaskDetail, getV7AssignedStudents } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TaskForm } from "../../task-form";

export const metadata = { title: "Edit Tugas" };

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/tugas/${taskId}/edit`);
  const terms = await getTerminology(profile.tenantId);

  const [task, students] = await Promise.all([getTaskDetail(taskId), getV7AssignedStudents()]);
  if (!task) notFound();

  return (
    <div>
      <PageHeader title="Edit Tugas" description={`${task.title} — ${task.studentName}.`} />
      <TaskForm
        mode="edit"
        students={students}
        task={{
          id: task.id,
          studentId: task.studentId,
          moduleType: task.moduleType,
          title: task.title,
          description: task.description,
          instruction: task.instruction,
          dueDate: task.dueDate,
        }}
      />
    </div>
  );
}
