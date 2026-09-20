import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, type SessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V11 — Akademik data helpers (server only).
 * All reads go through the user's own Supabase session (RLS enforced), all
 * mutations through SECURITY DEFINER RPCs (rule #55).
 */

export type YearRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "ARCHIVE";
};

export type SemesterRow = {
  id: string;
  academicYearId: string;
  sequence: 1 | 2;
  name: string;
  startDate: string;
  endDate: string;
  status: "AKTIF" | "SELESAI" | "BELUM";
};

export type ScheduleRow = {
  id: string;
  halaqahId: string;
  halaqahName: string;
  halaqahCode: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string | null;
};

export type OnboardingRow = {
  currentStep: number;
  completed: boolean;
  dismissed: boolean;
};

export const V11_ERRORS: Record<string, string> = {
  FORBIDDEN: "Anda tidak memiliki izin untuk tindakan ini.",
  NOT_FOUND: "Data tidak ditemukan.",
  BAD_NAME: "Nama tahun ajaran harus 4-20 karakter, contoh: 2026/2027.",
  BAD_PERIOD: "Tanggal selesai harus setelah tanggal mulai.",
  YEAR_OVERLAP: "Rentang tanggal tahun ajaran bertabrakan dengan tahun ajaran lain.",
  BAD_DAY: "Hari tidak valid.",
  BAD_TIME: "Jam selesai harus setelah jam mulai.",
  BAD_LEVEL: "Level harus 1-40 karakter.",
  BAD_STATUS: "Status tidak valid.",
  BAD_STEP: "Langkah onboarding tidak valid.",
  SAME_HALAQAH: "Santri sudah berada di halaqah tujuan.",
  SAME_STATUS: "Status santri sudah seperti itu.",
  EMPTY: "Pilih minimal satu santri terlebih dahulu.",
};

export function v11ErrorMessage(message: string): string {
  for (const key of Object.keys(V11_ERRORS)) {
    if (message.includes(key)) return V11_ERRORS[key];
  }
  return message || "Terjadi kesalahan. Coba lagi.";
}

/* ------------------------------------------------------------------------ */
/* Years & semesters (cached per request — rule #56)                        */
/* ------------------------------------------------------------------------ */

export const getAcademicYears = cache(async (): Promise<YearRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, status")
    .order("start_date", { ascending: false });
  return (data ?? []).map((y) => ({
    id: y.id,
    name: y.name,
    startDate: y.start_date,
    endDate: y.end_date,
    status: y.status as YearRow["status"],
  }));
});

export const getActiveYear = cache(async (): Promise<YearRow | null> => {
  const years = await getAcademicYears();
  return years.find((y) => y.status === "ACTIVE") ?? null;
});

export const getSemesters = cache(async (yearId: string): Promise<SemesterRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_semesters")
    .select("id, academic_year_id, sequence, name, start_date, end_date, status")
    .eq("academic_year_id", yearId)
    .order("sequence");
  return (data ?? []).map((s) => ({
    id: s.id,
    academicYearId: s.academic_year_id,
    sequence: s.sequence as 1 | 2,
    name: s.name,
    startDate: s.start_date,
    endDate: s.end_date,
    status: s.status as SemesterRow["status"],
  }));
});

export const getActiveSemester = cache(async (): Promise<SemesterRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_semesters")
    .select("id, academic_year_id, sequence, name, start_date, end_date, status")
    .eq("status", "AKTIF")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    academicYearId: data.academic_year_id,
    sequence: data.sequence as 1 | 2,
    name: data.name,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status as SemesterRow["status"],
  };
});

/** Resolve the semester being viewed: explicit ?semester= -> active -> first of year. */
export async function resolveViewYear(searchYearId?: string) {
  const years = await getAcademicYears();
  const year = years.find((y) => y.id === searchYearId) ?? years.find((y) => y.status === "ACTIVE") ?? years[0] ?? null;
  if (!year) return { year: null, semesters: [], semester: null };
  const semesters = await getSemesters(year.id);
  const activeGlobal = await getActiveSemester();
  const semester =
    (year.status === "ACTIVE" ? semesters.find((s) => s.status === "AKTIF") : null) ??
    (activeGlobal?.academicYearId === year.id ? activeGlobal : null) ??
    semesters.find((s) => s.status === "AKTIF") ??
    null;
  return { year, semesters, semester };
}

/* ------------------------------------------------------------------------ */
/* Schedules (#13-#15)                                                      */
/* ------------------------------------------------------------------------ */

export const getLearningSettings = cache(async (): Promise<{ days: string[]; note: string | null }> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("learning_settings")
    .select("days, note")
    .maybeSingle();
  return { days: (data?.days as string[] | null) ?? [], note: data?.note ?? null };
});

export const getSchedules = cache(async (): Promise<ScheduleRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("learning_schedules")
    .select("id, halaqah_id, day, start_time, end_time, room, halaqahs(name, business_code)")
    .order("day")
    .order("start_time");
  return (data ?? []).map((s) => {
    const halaqah = s.halaqahs as unknown as { name: string; business_code: string } | null;
    return {
      id: s.id,
      halaqahId: s.halaqah_id,
      halaqahName: halaqah?.name ?? "-",
      halaqahCode: halaqah?.business_code ?? "",
      day: s.day,
      startTime: s.start_time.slice(0, 5),
      endTime: s.end_time.slice(0, 5),
      room: s.room,
    };
  });
});

/* ------------------------------------------------------------------------ */
/* Enrollments / promotions / status history                                */
/* ------------------------------------------------------------------------ */

export type EnrollmentRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  halaqahId: string | null;
  halaqahName: string | null;
  level: string | null;
};

export async function getEnrollments(yearId: string): Promise<EnrollmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_enrollments")
    .select(
      "id, student_id, halaqah_id, level, students(business_code, full_name), halaqahs(name)"
    )
    .eq("academic_year_id", yearId)
    .order("created_at");
  return (data ?? []).map((e) => {
    const student = e.students as unknown as { business_code: string; full_name: string } | null;
    const halaqah = e.halaqahs as unknown as { name: string } | null;
    return {
      id: e.id,
      studentId: e.student_id,
      studentCode: student?.business_code ?? "",
      studentName: student?.full_name ?? "-",
      halaqahId: e.halaqah_id,
      halaqahName: halaqah?.name ?? null,
      level: e.level,
    };
  });
}

export async function getStudentHistory(studentId: string) {
  const supabase = await createClient();
  const [transfers, promotions, statuses, enrollments] = await Promise.all([
    supabase
      .from("student_transfers")
      .select(
        "id, effective_date, reason, semester_id, " +
        "halaqahs!student_transfers_from_halaqah_id_fkey(name), " +
        "halaqahs2:halaqahs!student_transfers_to_halaqah_id_fkey(name)"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_promotions")
      .select("id, created_at, from_level, to_level, note, semester_id")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_status_history")
      .select("id, created_at, from_status, to_status, effective_date, reason, note, target_name")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_enrollments")
      .select("id, level, academic_year_id, semester_id, halaqah_id, halaqahs(name), academic_years(name)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
  ]);
  return { transfers, promotions, statuses, enrollments };
}

/* ------------------------------------------------------------------------ */
/* Onboarding (#17-#28)                                                     */
/* ------------------------------------------------------------------------ */

export const getOnboarding = cache(async (): Promise<OnboardingRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_progress")
    .select("current_step, completed, dismissed")
    .maybeSingle();
  return data ? { currentStep: data.current_step, completed: data.completed, dismissed: data.dismissed } : null;
});

/** Which wizard steps still have no data? Merged with saved progress (#82). */
export async function computeOnboardingSteps() {
  const supabase = await createClient();
  const [yearsRes, settingsRes, teachersRes, studentsRes, halaqahRes] = await Promise.all([
    supabase.from("academic_years").select("id", { count: "exact", head: true }),
    supabase.from("learning_schedules").select("id", { count: "exact", head: true }),
    supabase.from("teachers").select("id", { count: "exact", head: true }),
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("halaqahs").select("id", { count: "exact", head: true }),
  ]);
  return {
    tahunAjaran: (yearsRes.count ?? 0) > 0,
    jadwal: (settingsRes.count ?? 0) > 0,
    guru: (teachersRes.count ?? 0) > 0,
    santri: (studentsRes.count ?? 0) > 0,
    halaqah: (halaqahRes.count ?? 0) > 0,
  };
}

/** Tenant profile basics for the wizard's step 1 (tenant scoped via RLS). */
export const getTenantProfile = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const [{ data: tenant }, { data: leader }] = await Promise.all([
    supabase.from("tenants").select("name, kind").eq("id", tenantId).maybeSingle(),
    supabase.from("leader_profiles").select("full_name, front_title, back_title").maybeSingle(),
  ]);
  return { tenant, leader };
});

/* ------------------------------------------------------------------------ */
/* Authorization helpers (#55/#74)                                          */
/* ------------------------------------------------------------------------ */

export function assertStaff(profile: SessionProfile | null): SessionProfile {
  if (!profile || !profile.tenantId) throw new Error("FORBIDDEN");
  return profile;
}

/** Wali-of-student check mirroring the DB helper (defense in depth). */
export async function assertWaliOfStudent(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("guardian_students")
    .select("id, guardians!inner(profile_id)")
    .eq("student_id", studentId)
    .maybeSingle();
  return Boolean(data);
}

export async function canViewStudent(profile: SessionProfile, studentId: string): Promise<boolean> {
  if (profile.role === "ADMIN" || profile.role === "KOORDINATOR" || profile.role === "USTADZ") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();
    return Boolean(data);
  }
  if (profile.role === "WALI_SANTRI") return assertWaliOfStudent(studentId);
  return false;
}

/* ------------------------------------------------------------------------ */
/* Riwayat Perkembangan (#43-#48)                                           */
/* ------------------------------------------------------------------------ */

export type DevStudent = { id: string; code: string; name: string };

/** Students the current role may inspect (#48). Server scoped + RLS backed. */
export async function getDevelopmentStudents(profile: SessionProfile): Promise<DevStudent[]> {
  const supabase = await createClient();
  const cols = "id, business_code, full_name";
  if (profile.role === "ADMIN" || profile.role === "KOORDINATOR") {
    const { data } = await supabase
      .from("students")
      .select(cols)
      .eq("tenant_id", profile.tenantId!)
      .order("business_code");
    return (data ?? []).map((s) => ({ id: s.id, code: s.business_code, name: s.full_name }));
  }
  if (profile.role === "USTADZ") {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("tenant_id", profile.tenantId!)
      .eq("profile_id", profile.id)
      .limit(1)
      .maybeSingle()
      .then(async (byId) => {
        if (byId.data || !profile.fullName) return byId;
        return supabase
          .from("teachers")
          .select("id")
          .eq("tenant_id", profile.tenantId!)
          .ilike("full_name", profile.fullName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      });
    if (!teacher) return [];
    const { data } = await supabase
      .from("teacher_students")
      .select(`id, students(${cols})`)
      .eq("teacher_id", teacher.id)
      .order("created_at");
    return (data ?? [])
      .map((r) => r.students as unknown as { id: string; business_code: string; full_name: string } | null)
      .filter(Boolean)
      .map((s) => ({ id: s!.id, code: s!.business_code, name: s!.full_name }));
  }
  if (profile.role === "WALI_SANTRI") {
    const { data: guardian } = await supabase
      .from("guardians")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!guardian) return [];
    const { data } = await supabase
      .from("guardian_students")
      .select(`id, students(${cols})`)
      .eq("guardian_id", guardian.id)
      .order("created_at");
    return (data ?? [])
      .map((r) => r.students as unknown as { id: string; business_code: string; full_name: string } | null)
      .filter(Boolean)
      .map((s) => ({ id: s!.id, code: s!.business_code, name: s!.full_name }));
  }
  return [];
}

/** Aggregate counts per activity kind from the V11 VIEW (rule #46). */
export async function getDevelopmentSummary(studentId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("development_summary", { p_student_id: studentId });
  const raw = (data ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
  return out;
}
