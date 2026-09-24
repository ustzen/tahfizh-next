import { cleanNis, compareByNis } from "@/lib/nis";
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { type TahfidzMode, type GradeConfig } from "@/lib/tahfidz";

import { NOTE_SLOTS, type NoteSlot, NOTE_SLOT_LABELS } from "@/lib/tartil-shared";

export { NOTE_SLOTS, NOTE_SLOT_LABELS } from "@/lib/tartil-shared";
export type { NoteSlot } from "@/lib/tartil-shared";

/**
 * TAHFIZH V4 — Tartil + Kartu Prestasi data access (SERVER ONLY).
 *
 * Tenant, teacher and student identity always come from the server session —
 * never the client (rule #30). Mode nilai Tartil sendiri per lembaga
 * (tartil_settings) — terpisah dari mode Tahfidz; grades tetap satu sumber
 * (tahfidz_grade_settings).
 */

export type TartilMaterial = {
  id: string;
  name: string;
  jilid: string | null;
  pagesLabel: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  inUse: boolean;
};

export type NoteTemplate = {
  id: string;
  slot: NoteSlot;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

export type TartilConfig = {
  mode: TahfidzMode;
  grades: GradeConfig[];
  materials: TartilMaterial[];
  templates: NoteTemplate[];
};

export type TartilMethod = {
  id: string;
  name: string;
  jilidCount: number;
  sortOrder: number;
  isActive: boolean;
};

/** V12.14 — metode baca per lembaga (Iqro, Ummi, Tartili, …, atau custom). */
export const getTartilMethods = cache(async (): Promise<TartilMethod[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_methods_list");
  if (error) {
    console.error("tartil_methods_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    jilidCount: Number(m.jilid_count ?? 0),
    sortOrder: Number(m.sort_order ?? 0),
    isActive: m.is_active !== false,
  }));
});

/** Full Tartil config for this tenant (request-cached). */
export const getTartilConfig = cache(async (tenantId: string): Promise<TartilConfig> => {
  const supabase = await createClient();

  // Self-heal: pastikan setiap kategori punya 2 template default (slot yang
  // sudah diisi guru TIDAK ditimpa). Lewat RPC (runtime) — aman terhadap
  // batas ALTER TYPE ADD VALUE dalam satu transaksi saat migrasi. Gagal
  // diam saja: fitur tetap jalan dengan template yang ada.
  try {
    await supabase.rpc("tartil_seed_note_templates_v2", { p_tenant: tenantId });
  } catch {
    // RPC belum ada (SQL lama) → abaikan.
  }

  // V12.16 — mode nilai Tartil PER-LEMBAGA sendiri (tabel tartil_settings),
  // terpisah dari mode Tahfidz. Grades tetap satu sumber (tahfidz_grade_settings).
  const [settingsRes, gradesRes, materialsRes, templatesRes, usedRes] = await Promise.all([
    supabase
      .from("tartil_settings")
      .select("mode")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("tahfidz_grade_settings")
      .select("id, label, min_value, max_value, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase
      .from("tartil_materials")
      .select("id, name, jilid, pages_label, description, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase
      .from("tartil_note_templates")
      .select("id, slot, content, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase.from("tartil_assessments").select("material_id").eq("tenant_id", tenantId),
  ]);

  const usedIds = new Set((usedRes.data ?? []).map((r) => r.material_id));

  return {
    mode: ((settingsRes.data?.mode as TahfidzMode) ?? "CENTANG"),
    grades: (gradesRes.data ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      minValue: g.min_value,
      maxValue: g.max_value,
    })),
    materials: (materialsRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      jilid: m.jilid ?? null,
      pagesLabel: m.pages_label ?? null,
      description: m.description ?? null,
      sortOrder: m.sort_order,
      isActive: m.is_active,
      inUse: usedIds.has(m.id),
    })),
    templates: (templatesRes.data ?? []).map((t) => ({
      id: t.id,
      slot: t.slot as NoteSlot,
      content: t.content,
      sortOrder: t.sort_order,
      isActive: t.is_active,
    })),
  };
});

export const getActiveTartilConfig = cache(async (tenantId: string) => {
  const config = await getTartilConfig(tenantId);
  return {
    ...config,
    materials: config.materials.filter((m) => m.isActive),
    templates: config.templates.filter((t) => t.isActive),
  };
});

/** This ustadz's teacher row (V12.11: UUID dulu, fallback nama). */
export const getTartilTeacherForSession = cache(async () => {
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

export type TartilStudentSummary = {
  studentId: string;
  nis: string | null;
  fullName: string;
  gender: "L" | "P";
  studentStatus: string;
  assessedCount: number;
  lastMaterial: string | null;
  lastPages: string | null;
  lastScoreLabel: string | null;
  lastScoreValue: number | null;
  lastMode: TahfidzMode | null;
  lastAssessedAt: string | null;
};

/** Assigned-student summaries for the Tartil list (rule #33). */
export async function getTartilStudentSummaries(teacherId: string): Promise<TartilStudentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_teacher_summaries", { p_teacher_id: teacherId });
  if (error) {
    console.error("tartil_teacher_summaries failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Record<string, unknown>[];

  // NIS = NIS lembaga (students.nis), bukan business_code (S-21, dst).
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

  const mapped = rows.map((r) => ({
    studentId: r.student_id as string,
    nis: nisById.get(r.student_id as string) ?? null,
    fullName: r.full_name as string,
    gender: r.gender as "L" | "P",
    studentStatus: r.student_status as string,
    assessedCount: Number(r.assessed_count ?? 0),
    lastMaterial: (r.last_material as string | null) ?? null,
    lastPages: (r.last_pages as string | null) ?? null,
    lastScoreLabel: (r.last_score_label as string | null) ?? null,
    lastScoreValue: (r.last_score_value as number | null) ?? null,
    lastMode: (r.last_mode as TahfidzMode | null) ?? null,
    lastAssessedAt: (r.last_assessed_at as string | null) ?? null,
  }));
  return mapped.sort((a, b) =>
    compareByNis({ nis: a.nis, name: a.fullName }, { nis: b.nis, name: b.fullName })
  );
}

export type TartilEntry = {
  id: string;
  materialName: string;
  pagesLabel: string | null;
  assessedAt: string;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreValue: number | null;
  scoreLabel: string | null;
  freeNote: string | null;
  teacherName: string | null;
  notes: Partial<Record<NoteSlot, string>>;
  updatedAt: string;
};

/** Tartil history for one student (guru detail + edit; rule #38/#39). */
export async function getTartilStudentAssessments(studentId: string): Promise<TartilEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_student_assessments", {
    p_student_id: studentId,
  });
  if (error) {
    console.error("tartil_student_assessments failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    materialName: r.material_name as string,
    pagesLabel: (r.pages_label as string | null) ?? null,
    assessedAt: r.assessed_at as string,
    status: r.status as TartilEntry["status"],
    scoreValue: (r.score_value as number | null) ?? null,
    scoreLabel: (r.score_label as string | null) ?? null,
    freeNote: (r.free_note as string | null) ?? null,
    teacherName: (r.teacher_name as string | null) ?? null,
    notes: (r.notes ?? {}) as Partial<Record<NoteSlot, string>>,
    updatedAt: r.updated_at as string,
  }));
}

export const ACHIEVEMENT_MODULES = [
  "TARTIL", "TAHFIDZ", "SETORAN", "HADITS", "DOA", "TAJWID", "TUGAS", "JURNAL",
] as const;
export type AchievementModule = (typeof ACHIEVEMENT_MODULES)[number];

export type AchievementEntry = {
  module: AchievementModule;
  occurredAt: string;
  title: string;
  subtitle: string;
  scoreLabel: string | null;
  scoreValue: number | null;
  scoreMode: string;
  status: string;
  teacherName: string | null;
  notes: Record<string, string>;
  refId: string;
};

/**
 * KARTU PRESTASI timeline (rule #16-#21). Data comes from module histories —
 * Tartil/Tahfidz/Setoran entries appear here automatically (rule #17/#19: no
 * double input). Guru access is verified against the assignment; Admin sees
 * own tenant.
 */
export async function getAchievementTimeline(
  studentId: string,
  module: "ALL" | AchievementModule = "ALL"
): Promise<AchievementEntry[] | null> {
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return null;

  // Guru may only open the card of their own assigned students.
  if (profile.role === "USTADZ") {
    const teacher = await getTartilTeacherForSession();
    if (!teacher) return null;
    const supabase = await createClient();
    const { data: rel } = await supabase
      .from("teacher_students")
      .select("id")
      .eq("teacher_id", teacher.id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!rel) return null;
  } else if (profile.role !== "ADMIN") {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_student_timeline", {
    p_student_id: studentId,
    p_module: module,
  });
  if (error) {
    console.error("tartil_student_timeline failed:", error.message);
    return null;
  }

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    module: r.module as AchievementEntry["module"],
    occurredAt: r.occurred_at as string,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? "",
    scoreLabel: (r.score_label as string | null) ?? null,
    scoreValue: (r.score_value as number | null) ?? null,
    scoreMode: (r.score_mode as string | null) ?? "CENTANG",
    status: r.status as string,
    teacherName: (r.teacher_name as string | null) ?? null,
    notes: (r.notes_json ?? {}) as Record<string, string>,
    refId: r.ref_id as string,
  }));
}
