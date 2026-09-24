import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTaskDetail, getTaskHistory } from "@/lib/v7";
import { getActiveTahfidzConfig } from "@/lib/tahfidz";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskStatusControls } from "./status-controls";
import { TASK_MODULE_OPTIONS, taskStatusLabel, taskStatusStyle } from "@/lib/v7-shared";
import { cn } from "@/lib/utils";
import { fmtDMY } from "@/lib/date-format";

export const metadata = { title: "Detail Tugas" };

function formatDate(iso: string) {
  return fmtDMY(iso);
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/tugas/${taskId}`);
  const terms = await getTerminology(profile.tenantId);

  const task = await getTaskDetail(taskId);
  if (!task) notFound();

  const [history, config] = await Promise.all([
    getTaskHistory(taskId),
    getActiveTahfidzConfig(profile.tenantId!),
  ]);

  return (
    <div>
      <PageHeader
        title={task.title}
        description={`${task.studentName} — ${
          TASK_MODULE_OPTIONS.find((m) => m.value === task.moduleType)?.label ?? task.moduleType
        }`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href={`/ustadz/tugas/${taskId}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ustadz/tugas">
                <ArrowLeft className="size-4" /> Daftar Tugas
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="shadow-card rounded-2xl">
            <CardContent className="px-5 py-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-role uppercase">📚 Tugas</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{task.title}</p>
                  {task.description && <p className="text-muted-foreground mt-1 text-sm">{task.description}</p>}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                    taskStatusStyle(task.status)
                  )}
                >
                  {taskStatusLabel(task.status)}
                </span>
              </div>

              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-foreground/85">
                <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Instruksi</p>
                <p className="whitespace-pre-line">{task.instruction}</p>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Diberikan</dt>
                  <dd className="font-medium text-foreground">{formatDate(task.assignedDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Deadline</dt>
                  <dd className="font-medium text-foreground">{formatDate(task.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Guru</dt>
                  <dd className="font-medium text-foreground">{task.teacherName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Nilai (mode {config.mode})</dt>
                  <dd className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {task.scoreLabel ?? (task.scoreValue !== null ? task.scoreValue : "—")}
                  </dd>
                </div>
                {task.completionNote && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Catatan Pengumpulan</dt>
                    <dd className="font-medium text-foreground">{task.completionNote}</dd>
                  </div>
                )}
                {task.teacherNote && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Catatan Guru</dt>
                    <dd className="font-medium text-foreground">{task.teacherNote}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <TaskStatusControls
            taskId={task.id}
            status={task.status}
            mode={config.mode}
            grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
            completionNote={task.completionNote ?? ""}
            teacherNote={task.teacherNote ?? ""}
            scoreValue={task.scoreValue}
            scoreLabel={task.scoreLabel ?? ""}
          />
        </div>

        <Card className="shadow-card h-fit rounded-2xl">
          <CardHeader>
            <CardTitle>Histori Status</CardTitle>
            <CardDescription>Semua perubahan status & penilaian.</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">Belum ada perubahan.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="bg-gradient-brand absolute -left-[21px] top-1 size-2.5 rounded-full" />
                    <p className="text-sm font-medium text-foreground">
                      {h.oldStatus ? `${taskStatusLabel(h.oldStatus)} → ` : "Dibuat · "}
                      {taskStatusLabel(h.newStatus)}
                    </p>
                    {(h.scoreLabel || h.scoreValue !== null || h.note) && (
                      <p className="text-muted-foreground text-xs">
                        {h.scoreLabel ?? h.scoreValue ?? ""}
                        {h.note ? ` · ${h.note}` : ""}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">{formatDate(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
