import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getTahfidzConfig, type TahfidzMode, type GradeConfig } from "@/lib/tahfidz";

import {
  LEARNING_MODULES,
  LEARNING_MODULE_CONFIGS,
  type LearningModule,
} from "@/lib/learning-shared";

export { LEARNING_MODULES, LEARNING_MODULE_CONFIGS } from "@/lib/learning-shared";
export type { LearningModule } from "@/lib/learning-shared";

/**
 * TAHFIZH V6 — Hadits / Doa Harian / Tajwid data access (SERVER ONLY).
 *
 * One generic engine across the three modules (rule #2/#20). Tenant, teacher
 * and student identity always come from the server session (rule #34); the
 * scoring mode/grades are REUSED from V3 (rule #8/#14).
 */

export type LearningMaterial = {
  id: string;
  title: string;
  subtitle: string | null;   // category (Tajwid) / source (Hadits)
  arabicText: string | null;
  translation: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  inUse: boolean;
};

export type LearningNoteTemplate = {
  id: string;
  moduleType: LearningModule;
  slot: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

export type LearningConfig = {
  mode: TahfidzMode;
  grades: GradeConfig[];
  materials: LearningMaterial[];
  templates: LearningNoteTemplate[];
};

/** Config for ONE module of this tenant (request-cached). */
export const getLearningConfig = cache(
  async (tenantId: string, module: LearningModule): Promise<LearningConfig> => {
    const supabase = await createClient();

    const [tahfidz, materialsRes, templatesRes] = await Promise.all([
      getTahfidzConfig(tenantId), // mode + grades — single scoring source
      supabase
        .from(moduleTable(module))
        .select("id, title, sort_order, is_active, *")
        .eq("tenant_id", tenantId)
        .order("sort_order"),
      supabase
        .from("learning_note_templates")
        .select("id, module_type, slot, content, sort_order, is_active")
        .eq("tenant_id", tenantId)
        .eq("module_type", module)
        .order("sort_order"),
    ]);

    // "in use" = any assessment history references the material.
    const { data: used } = await supabase.rpc("learning_used_material_ids", {
      p_module: module,
    });
    const usedIds = new Set(((used ?? []) as { material_id: string }[]).map((r) => r.material_id));

    return {
      mode: tahfidz.mode,
      grades: tahfidz.grades,
      materials: (materialsRes.data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          title: r.title as string,
          subtitle:
            module === "TAJWID"
              ? ((r.category as string | null) ?? null)
              : ((r.source_ref as string | null) ?? null),
          arabicText:
            module === "TAJWID"
              ? ((r.arabic_example as string | null) ?? null)
              : ((r.arabic_text as string | null) ?? null),
          translation: (r.translation as string | null) ?? null,
          description: (r.description as string | null) ?? null,
          sortOrder: r.sort_order as number,
          isActive: r.is_active as boolean,
          inUse: usedIds.has(r.id as string),
        };
      }),
      templates: (templatesRes.data ?? []).map((t) => ({
        id: t.id,
        moduleType: t.module_type as LearningModule,
        slot: t.slot,
        content: t.content,
        sortOrder: t.sort_order,
        isActive: t.is_active,
      })),
    };
  }
);

export const getActiveLearningConfig = cache(
  async (tenantId: string, module: LearningModule) => {
    const config = await getLearningConfig(tenantId, module);
    return {
      ...config,
      materials: config.materials.filter((m) => m.isActive),
      templates: config.templates.filter((t) => t.isActive),
    };
  }
);

/** DB table per module (kept in one place). */
export function moduleTable(module: LearningModule): string {
  return module === "HADITS"
    ? "hadith_materials"
    : module === "DOA"
      ? "daily_prayer_materials"
      : "tajwid_materials";
}

/** This ustadz's teacher row — V12.11: UUID dulu, fallback nama. */
export const getLearningTeacherForSession = cache(async () => {
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

export type LearningStudentSummary = {
  studentId: string;
  businessCode: string;
  fullName: string;
  gender: "L" | "P";
  studentStatus: string;
  assessedCount: number;
  lulusCount: number;
  lastMaterial: string | null;
  lastStatus: string | null;
  lastScoreLabel: string | null;
  lastScoreValue: number | null;
  lastDate: string | null;
};

/** Assigned-student summaries for a module list page (rule #38/#39). */
export async function getLearningStudentSummaries(
  teacherId: string,
  module: LearningModule
): Promise<LearningStudentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_teacher_summaries", {
    p_teacher_id: teacherId,
    p_module: module,
  });
  if (error) {
    console.error("learning_teacher_summaries failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: r.student_id as string,
    businessCode: r.business_code as string,
    fullName: r.full_name as string,
    gender: r.gender as "L" | "P",
    studentStatus: r.student_status as string,
    assessedCount: Number(r.assessed_count ?? 0),
    lulusCount: Number(r.lulus_count ?? 0),
    lastMaterial: (r.last_material as string | null) ?? null,
    lastStatus: (r.last_status as string | null) ?? null,
    lastScoreLabel: (r.last_score_label as string | null) ?? null,
    lastScoreValue: (r.last_score_value as number | null) ?? null,
    lastDate: (r.last_date as string | null) ?? null,
  }));
}

export type LearningEntry = {
  id: string;
  materialTitle: string;
  assessedDate: string;
  status: string;
  scoreValue: number | null;
  scoreLabel: string | null;
  freeNote: string | null;
  teacherName: string | null;
  notes: Record<string, string>;
  updatedAt: string;
};

/** Student history for one module (detail + histori; rule #25). */
export async function getLearningStudentAssessments(
  studentId: string,
  module: LearningModule,
  filter = "ALL"
): Promise<LearningEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_student_assessments", {
    p_student_id: studentId,
    p_module: module,
    p_filter: filter,
  });
  if (error) {
    console.error("learning_student_assessments failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    materialTitle: r.material_title as string,
    assessedDate: r.assessed_date as string,
    status: r.status as string,
    scoreValue: (r.score_value as number | null) ?? null,
    scoreLabel: (r.score_label as string | null) ?? null,
    freeNote: (r.free_note as string | null) ?? null,
    teacherName: (r.teacher_name as string | null) ?? null,
    notes: (r.notes ?? {}) as Record<string, string>,
    updatedAt: r.updated_at as string,
  }));
}

export type LearningModuleCount = { module: string; materialCount: number; assessmentCount: number };

/** Perkembangan Pembelajaran summary for a student (rule #26). */
export async function getLearningModuleCounts(studentId: string): Promise<LearningModuleCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_module_counts", {
    p_student_id: studentId,
  });
  if (error) {
    console.error("learning_module_counts failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    module: r.module as string,
    materialCount: Number(r.material_count ?? 0),
    assessmentCount: Number(r.assessment_count ?? 0),
  }));
}

export type TodayActivity = { module: string; todayCount: number };

/** Aktivitas Hari Ini for the guru dashboard (rule #27). */
export async function getTeacherTodayActivity(teacherId: string): Promise<TodayActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_teacher_today", {
    p_teacher_id: teacherId,
  });
  if (error) {
    console.error("learning_teacher_today failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    module: r.module as string,
    todayCount: Number(r.today_count ?? 0),
  }));
}
