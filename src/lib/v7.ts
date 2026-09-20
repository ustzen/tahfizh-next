import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

import { type JournalFieldDef, type JournalFieldDto } from "@/lib/v7-shared";

/**
 * TAHFIZH V7 — Target / Tugas / Custom Jurnal data access (SERVER ONLY).
 *
 * All identity (tenant/teacher/student) resolves from the server session,
 * never the client (rule #42). Lists and details come from SECURITY DEFINER
 * RPCs that re-verify role + relationship server-side.
 */

/* ------------------------------ session guru ------------------------------ */

/** This ustadz's teacher row — V12.11: UUID dulu, fallback nama. */
export const getV7TeacherForSession = cache(async () => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) return null;
  const supabase = await createClient();

  const byId = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle();
  if (byId.data) return byId.data;

  if (!profile.fullName) return null;
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .ilike("full_name", profile.fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return teacher ?? null;
});

/* -------------------------------- TARGET ---------------------------------- */

export type TargetRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  moduleType: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  status: string;
  note: string | null;
  teacherName: string | null;
  updatedAt: string;
};

function mapTarget(r: Record<string, unknown>): TargetRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    moduleType: r.module_type as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    targetValue: Number(r.target_value ?? 0),
    currentValue: Number(r.current_value ?? 0),
    unit: (r.unit as string | null) ?? null,
    status: r.status as string,
    note: (r.note as string | null) ?? null,
    teacherName: (r.teacher_name as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function getTargetTeacherList(): Promise<TargetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_teacher_list");
  if (error) {
    console.error("target_teacher_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapTarget);
}

export async function getTargetDetail(targetId: string): Promise<TargetRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_student_detail", { p_target_id: targetId });
  if (error || !data || data.length === 0) return null;
  return mapTarget((data as Record<string, unknown>[])[0]);
}

export type TargetHistoryRow = {
  id: string;
  oldValue: number | null;
  newValue: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  source: string;
  createdAt: string;
};

export async function getTargetHistory(targetId: string): Promise<TargetHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_progress_history_list", { p_target_id: targetId });
  if (error) {
    console.error("target_progress_history_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    oldValue: (r.old_value as number | null) ?? null,
    newValue: (r.new_value as number | null) ?? null,
    oldStatus: (r.old_status as string | null) ?? null,
    newStatus: (r.new_status as string | null) ?? null,
    source: r.source as string,
    createdAt: r.created_at as string,
  }));
}

/* --------------------------------- TUGAS ---------------------------------- */

export type TaskRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  moduleType: string;
  title: string;
  description: string | null;
  instruction: string;
  assignedDate: string;
  dueDate: string;
  status: string;
  scoreValue: number | null;
  scoreLabel: string | null;
  completionNote: string | null;
  teacherNote: string | null;
  teacherName: string | null;
  updatedAt: string;
};

function mapTask(r: Record<string, unknown>): TaskRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    moduleType: r.module_type as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    instruction: r.instruction as string,
    assignedDate: r.assigned_date as string,
    dueDate: r.due_date as string,
    status: r.status as string,
    scoreValue: (r.score_value as number | null) ?? null,
    scoreLabel: (r.score_label as string | null) ?? null,
    completionNote: (r.completion_note as string | null) ?? null,
    teacherNote: (r.teacher_note as string | null) ?? null,
    teacherName: (r.teacher_name as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function getTaskTeacherList(): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_teacher_list");
  if (error) {
    console.error("task_teacher_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapTask);
}

export async function getTaskDetail(taskId: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_student_detail", { p_task_id: taskId });
  if (error || !data || data.length === 0) return null;
  return mapTask((data as Record<string, unknown>[])[0]);
}

export type TaskHistoryRow = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  scoreValue: number | null;
  scoreLabel: string | null;
  note: string | null;
  createdAt: string;
};

export async function getTaskHistory(taskId: string): Promise<TaskHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_status_history_list", { p_task_id: taskId });
  if (error) {
    console.error("task_status_history_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    oldStatus: (r.old_status as string | null) ?? null,
    newStatus: r.new_status as string,
    scoreValue: (r.score_value as number | null) ?? null,
    scoreLabel: (r.score_label as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/* ----------------------------- CUSTOM JURNAL ------------------------------ */

export type JournalTemplateDto = {
  id: string;
  name: string;
  description: string | null;
  showInAchievement: boolean;
  fields: JournalFieldDto[];
};

export async function getJournalTeacherTemplates(): Promise<JournalTemplateDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_teacher_templates");
  if (error) {
    console.error("journal_teacher_templates failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    showInAchievement: r.show_in_achievement as boolean,
    fields: ((r.fields ?? []) as Record<string, unknown>[]).map((f) => ({
      id: f.id as string,
      label: f.label as string,
      type: f.type as string,
      required: f.required as boolean,
      options: (f.options as string[] | null) ?? null,
      sortOrder: Number(f.sortOrder ?? 0),
    })),
  }));
}

export type JournalAdminTemplateDto = JournalTemplateDto & {
  sortOrder: number;
  isActive: boolean;
  entryCount: number;
};

export async function getJournalAdminTemplates(): Promise<JournalAdminTemplateDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_admin_templates");
  if (error) {
    console.error("journal_admin_templates failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    showInAchievement: r.show_in_achievement as boolean,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: r.is_active as boolean,
    entryCount: Number(r.entry_count ?? 0),
    fields: ((r.fields ?? []) as Record<string, unknown>[]).map((f) => ({
      id: f.id as string,
      label: f.label as string,
      type: f.type as string,
      required: f.required as boolean,
      options: (f.options as string[] | null) ?? null,
      sortOrder: Number(f.sortOrder ?? 0),
    })),
  }));
}

export type JournalEntryRow = {
  id: string;
  templateId: string;
  templateName: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  entryDate: string;
  freeText: string | null;
  valuesSummary: Record<string, string>;
  teacherName: string | null;
  updatedAt: string;
};

export async function getJournalTeacherEntries(templateId?: string): Promise<JournalEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_teacher_entries", {
    p_template_id: templateId ?? null,
  });
  if (error) {
    console.error("journal_teacher_entries failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    templateId: r.template_id as string,
    templateName: r.template_name as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    entryDate: r.entry_date as string,
    freeText: (r.free_text as string | null) ?? null,
    valuesSummary: (r.values_summary ?? {}) as Record<string, string>,
    teacherName: (r.teacher_name as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

export type JournalEntryDetail = {
  id: string;
  templateId: string;
  templateName: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  entryDate: string;
  freeText: string | null;
  valuesJson: Record<string, string>;
  teacherName: string | null;
};

export async function getJournalEntryDetail(entryId: string): Promise<JournalEntryDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_entry_detail", { p_entry_id: entryId });
  if (error || !data || data.length === 0) return null;
  const r = (data as Record<string, unknown>[])[0];
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    templateName: r.template_name as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    entryDate: r.entry_date as string,
    freeText: (r.free_text as string | null) ?? null,
    valuesJson: (r.values_json ?? {}) as Record<string, string>,
    teacherName: (r.teacher_name as string | null) ?? null,
  };
}

/* ----------------------- DASHBOARD / STUDENT SUMMARY ---------------------- */

export type V7TeacherCounts = { targets: number; tasks: number; journals: number };

export async function getV7TeacherCounts(teacherId: string): Promise<V7TeacherCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("v7_teacher_counts", { p_teacher_id: teacherId });
  if (error) {
    console.error("v7_teacher_counts failed:", error.message);
    return { targets: 0, tasks: 0, journals: 0 };
  }
  const out = { targets: 0, tasks: 0, journals: 0 };
  for (const r of ((data ?? []) as Record<string, unknown>[])) {
    if (r.section === "TARGETS") out.targets = Number(r.cnt ?? 0);
    if (r.section === "TASKS") out.tasks = Number(r.cnt ?? 0);
    if (r.section === "JOURNALS") out.journals = Number(r.cnt ?? 0);
  }
  return out;
}

export type V7StudentSummary = {
  activeTargets: number;
  avgProgress: number;
  activeTasks: number;
  journalMonth: number;
};

export async function getV7StudentSummary(studentId: string): Promise<V7StudentSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("v7_student_summary", { p_student_id: studentId });
  if (error || !data || data.length === 0) return null;
  const r = (data as Record<string, unknown>[])[0];
  return {
    activeTargets: Number(r.active_targets ?? 0),
    avgProgress: Number(r.avg_progress ?? 0),
    activeTasks: Number(r.active_tasks ?? 0),
    journalMonth: Number(r.journal_month ?? 0),
  };
}

/** Assigned students of this guru (for target/task/journal forms). */
export const getV7AssignedStudents = cache(async () => {
  const teacher = await getV7TeacherForSession();
  if (!teacher) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("teacher_students")
    .select("student:students (id, full_name, business_code, gender, status)")
    .eq("teacher_id", teacher.id);
  const rows = ((data ?? []) as unknown as {
    student: { id: string; full_name: string; business_code: string; gender: "L" | "P"; status: string }[] | null;
  }[]);
  return rows
    .map((r) => (Array.isArray(r.student) ? r.student[0] : r.student))
    .filter((s): s is { id: string; full_name: string; business_code: string; gender: "L" | "P"; status: string } =>
      !!s && s.status === "ACTIVE"
    )
    .map((s) => ({
      id: s.id,
      fullName: s.full_name,
      businessCode: s.business_code,
      gender: s.gender,
    }));
});

export type { JournalFieldDef, JournalFieldDto } from "@/lib/v7-shared";
