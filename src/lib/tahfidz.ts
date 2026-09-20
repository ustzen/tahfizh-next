import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V3 — Tahfidz data access (SERVER ONLY).
 *
 * Everything is tenant-scoped from the SERVER session (rule #35):
 * tenant/teacher identity is never read from the client. Query helpers are
 * request-cached (React cache()) so layouts + pages share one round trip.
 */

export type TahfidzMode = "CENTANG" | "HURUF" | "ANGKA";

export type GradeConfig = { id: string; label: string; minValue: number; maxValue: number };

export type TenantSurah = {
  id: string;
  name: string;            // display name (override ?? global)
  baseName: string | null; // global master name (null = tenant custom)
  surahId: string | null;  // null = custom tenant surah
  isCustom: boolean;
  isActive: boolean;
  sortOrder: number;
  inUse: boolean;
};

export type TahfidzConfig = {
  mode: TahfidzMode;
  grades: GradeConfig[];
  surahs: TenantSurah[];
};

/** Active tenant surahs in order (guru-facing catalog). */
export const getTahfidzConfig = cache(async (tenantId: string): Promise<TahfidzConfig> => {
  const supabase = await createClient();

  const [settingsRes, gradesRes, surahsRes, usedRes] = await Promise.all([
    supabase.from("tahfidz_settings").select("mode").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("tahfidz_grade_settings")
      .select("id, label, min_value, max_value, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase
      .from("tahfidz_tenant_surahs")
      .select("id, surah_id, name_override, sort_order, is_active, tahfidz_surahs(name)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase.from("tahfidz_assessments").select("tenant_surah_id").eq("tenant_id", tenantId),
  ]);

  const usedIds = new Set((usedRes.data ?? []).map((r) => r.tenant_surah_id));

  const surahs: TenantSurah[] = (surahsRes.data ?? []).map((s) => {
    type Row = {
      id: string;
      surah_id: string | null;
      name_override: string | null;
      sort_order: number;
      is_active: boolean;
      tahfidz_surahs: { name: string } | { name: string }[] | null;
    };
    const row = s as unknown as Row;
    const master = Array.isArray(row.tahfidz_surahs) ? row.tahfidz_surahs[0] : row.tahfidz_surahs;
    const baseName = master?.name ?? null;
    return {
      id: row.id,
      name: row.name_override ?? baseName ?? "Surat",
      baseName,
      surahId: row.surah_id,
      isCustom: row.surah_id === null,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      inUse: usedIds.has(row.id),
    };
  });

  const grades: GradeConfig[] = (gradesRes.data ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    minValue: g.min_value,
    maxValue: g.max_value,
  }));

  return {
    mode: ((settingsRes.data?.mode as TahfidzMode) ?? "CENTANG"),
    grades,
    surahs,
  };
});

export const getActiveTahfidzConfig = cache(async (tenantId: string) => {
  const config = await getTahfidzConfig(tenantId);
  return { ...config, surahs: config.surahs.filter((s) => s.isActive) };
});

/** This ustadz's teacher row (V12.11: UUID dulu, fallback nama). */
export const getTeacherForSession = cache(async () => {
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

export type StudentSummary = {
  studentId: string;
  businessCode: string;
  fullName: string;
  gender: "L" | "P";
  studentStatus: string;
  scoredCount: number;
  lastSurah: string | null;
  lastScoreLabel: string | null;
  lastScoreValue: number | null;
  lastMode: TahfidzMode | null;
  lastStatus: TahfidzProgress | null;
  lastAssessedAt: string | null;
};

export type TahfidzProgress = "BELUM" | "DIPELAJARI" | "DINILAI";

/** Assigned-student summaries for the Tahfidz list (rule #4/#40). */
export async function getTeacherStudentSummaries(teacherId: string): Promise<StudentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tahfidz_teacher_summaries", { p_teacher_id: teacherId });
  if (error) {
    console.error("tahfidz_teacher_summaries failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as {
    student_id: string;
    business_code: string;
    full_name: string;
    gender: "L" | "P";
    student_status: string;
    scored_count: number;
    last_surah_name: string | null;
    last_score_label: string | null;
    last_score_value: number | null;
    last_mode: TahfidzMode | null;
    last_status: TahfidzProgress | null;
    last_assessed_at: string | null;
  }[];
  return rows.map((r) => ({
    studentId: r.student_id,
    businessCode: r.business_code,
    fullName: r.full_name,
    gender: r.gender,
    studentStatus: r.student_status,
    scoredCount: r.scored_count ?? 0,
    lastSurah: r.last_surah_name,
    lastScoreLabel: r.last_score_label,
    lastScoreValue: r.last_score_value,
    lastMode: r.last_mode,
    lastStatus: r.last_status,
    lastAssessedAt: r.last_assessed_at,
  }));
}

/** Detail for ONE assigned student (RLS + RPC both verify the relationship). */
export async function getStudentTahfidzDetail(teacherId: string, studentId: string) {
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, business_code, full_name, gender, status")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return null;

  const [assessRes, activeSurahsRes, historyRes] = await Promise.all([
    supabase
      .from("tahfidz_assessments")
      .select("id, tenant_surah_id, status, score_value, score_label, note, assessed_at, mode_at_entry_cache")
      .eq("student_id", studentId)
      .order("assessed_at", { ascending: false }),
    supabase
      .from("tahfidz_tenant_surahs")
      .select("id, name_override, sort_order, tahfidz_surahs(name)")
      .eq("tenant_id", (await getSessionProfile())?.tenantId ?? "")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("tahfidz_assessment_history")
      .select("id, mode_at_entry, status, score_value, score_label, note, change_kind, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const surahNames = new Map<string, string>();
  for (const s of activeSurahsRes.data ?? []) {
    const row = s as unknown as {
      id: string;
      name_override: string | null;
      tahfidz_surahs: { name: string } | { name: string }[] | null;
    };
    const master = Array.isArray(row.tahfidz_surahs) ? row.tahfidz_surahs[0] : row.tahfidz_surahs;
    surahNames.set(row.id, row.name_override ?? master?.name ?? "Surat");
  }

  const assessments = (assessRes.data ?? []).map((a) => ({
    id: a.id as string,
    tenantSurahId: a.tenant_surah_id as string,
    surahName: surahNames.get(a.tenant_surah_id as string) ?? "Surat",
    status: a.status as TahfidzProgress,
    scoreValue: (a.score_value as number | null) ?? null,
    scoreLabel: (a.score_label as string | null) ?? null,
    note: (a.note as string | null) ?? null,
    assessedAt: a.assessed_at as string,
    mode: a.mode_at_entry_cache as TahfidzMode | null,
  }));

  const history = (historyRes.data ?? []).map((h) => ({
    id: h.id as string,
    surahName: "—",
    mode: h.mode_at_entry as TahfidzProgress | TahfidzMode,
    status: h.status as TahfidzProgress,
    scoreValue: (h.score_value as number | null) ?? null,
    scoreLabel: (h.score_label as string | null) ?? null,
    note: (h.note as string | null) ?? null,
    changeKind: h.change_kind as string,
    createdAt: h.created_at as string,
  }));

  // Attach surah names to history via assessments lookup (assessment_id → surah)
  const { data: histJoin } = await supabase
    .from("tahfidz_assessment_history")
    .select("id, tenant_surah_id")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);
  const joinMap = new Map((histJoin ?? []).map((j) => [j.id as string, j.tenant_surah_id as string]));
  for (const h of history) {
    const sid = joinMap.get(h.id);
    if (sid) h.surahName = surahNames.get(sid) ?? "Surat (nonaktif)";
  }

  return { student, assessments, activeSurahs: activeSurahsRes.data ?? [], history };
}

/** Surah selection metadata + existing assessment for the assessment form. */
export async function getAssessmentContext(teacherId: string, studentId: string) {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return null;
  const config = await getActiveTahfidzConfig(profile.tenantId);
  return config;
}

/** Human display of a score in any mode. */
export function scoreDisplay(
  mode: TahfidzMode,
  score: { scoreLabel: string | null; scoreValue: number | null } | null
): string {
  if (!score || (score.scoreLabel === null && score.scoreValue === null)) return "—";
  if (score.scoreLabel) return score.scoreLabel;
  return String(score.scoreValue);
}
