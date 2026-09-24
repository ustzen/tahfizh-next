import { cleanNis } from "@/lib/nis";
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getTahfidzConfig, type TahfidzMode, type GradeConfig } from "@/lib/tahfidz";
import { moduleTable, type LearningModule } from "@/lib/learning";

import {
  SUBMISSION_NOTE_SLOTS,
  type SubmissionNoteSlot,
  SUBMISSION_NOTE_SLOT_LABELS,
  type SubmissionFilter,
} from "@/lib/setoran-shared";

export { SUBMISSION_NOTE_SLOTS, SUBMISSION_NOTE_SLOT_LABELS } from "@/lib/setoran-shared";
export type { SubmissionNoteSlot, SubmissionFilter } from "@/lib/setoran-shared";

/**
 * TAHFIZH V5 — Setoran data access (SERVER ONLY).
 *
 * Reuses V3 master surahs + scoring config (rule #9, #12) and V4's teacher
 * resolution. Tenant/teacher/student identity always comes from the server
 * session — never from the client (rule #31, #54).
 */

export type SubmissionNoteTemplate = {
  id: string;
  slot: SubmissionNoteSlot;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

export type SetoranConfig = {
  mode: TahfidzMode;
  grades: GradeConfig[];
  templates: SubmissionNoteTemplate[];
};

/** Full Setoran config for this tenant (request-cached). */
export const getSetoranConfig = cache(async (tenantId: string): Promise<SetoranConfig> => {
  const supabase = await createClient();

  const [tahfidz, templatesRes] = await Promise.all([
    getTahfidzConfig(tenantId), // mode + grades — single scoring source (rule #12)
    supabase
      .from("tahfidz_submission_templates")
      .select("id, slot, content, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
  ]);

  return {
    mode: tahfidz.mode,
    grades: tahfidz.grades,
    templates: (templatesRes.data ?? []).map((t) => ({
      id: t.id,
      slot: t.slot as SubmissionNoteSlot,
      content: t.content,
      sortOrder: t.sort_order,
      isActive: t.is_active,
    })),
  };
});

export const getActiveSetoranConfig = cache(async (tenantId: string) => {
  const config = await getSetoranConfig(tenantId);
  return { ...config, templates: config.templates.filter((t) => t.isActive) };
});

/**
 * This ustadz's teacher row (server-resolved, same resolution as Tahfidz/
 * Tartil). Also returns the ACTIVE V3 tenant surahs — the setoran catalog.
 */
export const getSetoranTeacherForSession = cache(async () => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId || !profile.fullName) {
    return { teacher: null as { id: string } | null, surahs: [] as { id: string; name: string }[] };
  }
  const supabase = await createClient();

  const [{ data: teacher }, surahsRes] = await Promise.all([
    supabase
      .from("teachers")
      .select("id")
      .eq("tenant_id", profile.tenantId)
      .eq("profile_id", profile.id)
      .limit(1)
      .maybeSingle()
      .then(async (byId) => {
        if (byId.data || !profile.fullName) return byId;
        return supabase
          .from("teachers")
          .select("id")
          .eq("tenant_id", profile.tenantId)
          .ilike("full_name", profile.fullName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      }),
    supabase
      .from("tahfidz_tenant_surahs")
      .select("id, name_override, sort_order, tahfidz_surahs(name)")
      .eq("tenant_id", profile.tenantId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const surahs = (surahsRes.data ?? []).map((s) => {
    const row = s as unknown as {
      id: string;
      name_override: string | null;
      tahfidz_surahs: { name: string } | { name: string }[] | null;
    };
    const master = Array.isArray(row.tahfidz_surahs) ? row.tahfidz_surahs[0] : row.tahfidz_surahs;
    return { id: row.id, name: row.name_override ?? master?.name ?? "Surat" };
  });

  return { teacher: (teacher as { id: string } | null) ?? null, surahs };
});

export type SubmissionStudentSummary = {
  studentId: string;
  nis: string | null;
  fullName: string;
  gender: "L" | "P";
  studentStatus: string;
  submissionCount: number;
  lulusCount: number;
  lastSurah: string | null;
  lastAyat: string | null;
  lastKind: "HAFALAN_BARU" | "MUROJAAH" | null;
  lastResult: "LULUS" | "PERLU_MENGULANG" | "DITUNDA" | null;
  lastScoreLabel: string | null;
  lastScoreValue: number | null;
  lastDate: string | null;
};

/** Assigned-student summaries for the Setoran list (rule #5, #38). */
export async function getSubmissionStudentSummaries(
  teacherId: string
): Promise<SubmissionStudentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tahfidz_teacher_submission_summaries", {
    p_teacher_id: teacherId,
  });
  if (error) {
    console.error("tahfidz_teacher_submission_summaries failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Record<string, unknown>[];

  // NIS = NIS lembaga (students.nis), bukan business_code (S-21, dst).
  // Ditimpa di sini agar benar walau versi RPC di database masih lama.
  const nisById = new Map<string, string | null>();
  if (rows.length > 0) {
    const nisRes = await supabase
      .from("students")
      .select("id, nis, business_code")
      .in("id", rows.map((r) => r.student_id as string));
    if (!nisRes.error) {
      for (const n of nisRes.data ?? []) {
        nisById.set(n.id as string, cleanNis(n.nis as string | null, n.business_code as string | null));
      }
    }
  }

  return rows.map((r) => ({
    studentId: r.student_id as string,
    nis: nisById.has(r.student_id as string)
      ? (nisById.get(r.student_id as string) ?? null)
      : null,
    fullName: r.full_name as string,
    gender: r.gender as "L" | "P",
    studentStatus: r.student_status as string,
    submissionCount: Number(r.submission_count ?? 0),
    lulusCount: Number(r.lulus_count ?? 0),
    lastSurah: (r.last_surah as string | null) ?? null,
    lastAyat: (r.last_ayat as string | null) ?? null,
    lastKind: (r.last_kind as SubmissionStudentSummary["lastKind"] | null) ?? null,
    lastResult: (r.last_result as SubmissionStudentSummary["lastResult"] | null) ?? null,
    lastScoreLabel: (r.last_score_label as string | null) ?? null,
    lastScoreValue: (r.last_score_value as number | null) ?? null,
    lastDate: (r.last_date as string | null) ?? null,
  }));
}

export type SubmissionEntry = {
  id: string;
  kind: "HAFALAN_BARU" | "MUROJAAH";
  ayatLabel: string | null;
  assessedDate: string;
  result: "LULUS" | "PERLU_MENGULANG" | "DITUNDA";
  scoreValue: number | null;
  scoreLabel: string | null;
  freeNote: string | null;
  teacherName: string | null;
  surahName: string;
  notes: Partial<Record<SubmissionNoteSlot, string>>;
  updatedAt: string;
};

/** Setoran history for one student (detail + edit; rule #23, #27). */
export async function getStudentSubmissions(
  studentId: string,
  filter: SubmissionFilter = "ALL"
): Promise<SubmissionEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tahfidz_student_submissions", {
    p_student_id: studentId,
    p_filter: filter,
  });
  if (error) {
    console.error("tahfidz_student_submissions failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    kind: r.kind as SubmissionEntry["kind"],
    ayatLabel: (r.ayat_label as string | null) ?? null,
    assessedDate: r.assessed_date as string,
    result: r.result as SubmissionEntry["result"],
    scoreValue: (r.score_value as number | null) ?? null,
    scoreLabel: (r.score_label as string | null) ?? null,
    freeNote: (r.free_note as string | null) ?? null,
    teacherName: (r.teacher_name as string | null) ?? null,
    surahName: r.surah_name as string,
    notes: (r.notes ?? {}) as Partial<Record<SubmissionNoteSlot, string>>,
    updatedAt: r.updated_at as string,
  }));
}

// ===========================================================================
// V12.11 — SETORAN MULTI-MODUL (3 tab: Tahfidz / Hadits / Doa Harian)
// ===========================================================================

export type SetoranModuleTab = "TAHFIDZ" | "HADITS" | "DOA";

export type SetoranMaterialOption = {
  id: string;
  title: string;
  subtitle: string | null;
};

export type SetoranTemplateOption = { id: string; slot: string; content: string };

/**
 * Konfigurasi SATU tab setoran: daftar pilihan (surat utk Tahfidz / materi
 * utk Hadits & Doa) + template catatan per slot. Mode & grade dikirim sekali
 * per tab (mode bebas per tab — V12.11), default dari konfigurasi lembaga.
 */
export const getSetoranModuleConfig = cache(
  async (
    tenantId: string,
    tab: SetoranModuleTab
  ): Promise<{
    mode: TahfidzMode;
    grades: GradeConfig[];
    surahs: { id: string; name: string }[];
    materials: SetoranMaterialOption[];
    templates: SetoranTemplateOption[];
  }> => {
    const supabase = await createClient();

    const tahfidz = await getTahfidzConfig(tenantId);

    if (tab === "TAHFIDZ") {
      const surahsRes = await supabase
        .from("tahfidz_tenant_surahs")
        .select("id, name_override, sort_order, tahfidz_surahs(name)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order");
      const surahs = (surahsRes.data ?? []).map((s) => {
        const row = s as unknown as {
          id: string;
          name_override: string | null;
          tahfidz_surahs: { name: string } | { name: string }[] | null;
        };
        const master = Array.isArray(row.tahfidz_surahs) ? row.tahfidz_surahs[0] : row.tahfidz_surahs;
        return { id: row.id, name: row.name_override ?? master?.name ?? "Surat" };
      });
      const templatesRes = await supabase
        .from("tahfidz_submission_templates")
        .select("id, slot, content")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order");
      return {
        mode: tahfidz.mode,
        grades: tahfidz.grades,
        surahs,
        materials: [],
        templates: (templatesRes.data ?? []) as SetoranTemplateOption[],
      };
    }

    // HADITS / DOA — materi lembaga + template learning_note_templates.
    const module: LearningModule = tab;
    const [materialsRes, templatesRes] = await Promise.all([
      supabase
        .from(moduleTable(module))
        .select("id, title, category")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("learning_note_templates")
        .select("id, slot, content")
        .eq("tenant_id", tenantId)
        .eq("module_type", module)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    return {
      mode: tahfidz.mode,
      grades: tahfidz.grades,
      surahs: [],
      materials: (materialsRes.data ?? []).map((m) => ({
        id: (m as { id: string }).id,
        title: (m as { title: string }).title,
        subtitle: ((m as { category?: string | null }).category ?? null) as string | null,
      })),
      templates: (templatesRes.data ?? []) as SetoranTemplateOption[],
    };
  }
);
