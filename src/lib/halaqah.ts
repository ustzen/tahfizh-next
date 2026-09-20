import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type {
  AttendanceStatus,
  HalaqahListItem,
  HalaqahMember,
  HalaqahTeacher,
} from "@/lib/halaqah-shared";

/**
 * TAHFIZH V8 — Halaqah & Presensi data access (SERVER ONLY).
 * Tenant/teacher identity always resolves from the server session (rule #47);
 * client-supplied ids are only ever treated as opaque selectors that the
 * SECURITY DEFINER RPCs re-verify.
 */

export type HalaqahDetail = {
  halaqah: {
    id: string;
    businessCode: string;
    name: string;
    description: string;
    status: string;
  };
  teachers: HalaqahTeacher[];
  students: HalaqahMember[];
  studentCount: number;
  history: { studentName: string; halaqahName: string; joinedAt: string; leftAt: string | null }[];
};

export async function getAdminHalaqahList(): Promise<HalaqahListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("halaqah_admin_list");
  if (error) {
    console.error("halaqah_admin_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    businessCode: r.business_code as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    status: r.status as string,
    teacherNames: (r.teacher_names as string) ?? "",
    studentCount: Number(r.student_count ?? 0),
    teacherIds: (r.teacher_ids as string[]) ?? [],
  }));
}

export async function getTeacherHalaqahList(): Promise<HalaqahListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("halaqah_teacher_list");
  if (error) {
    console.error("halaqah_teacher_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    businessCode: r.business_code as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    status: r.status as string,
    teacherNames: (r.teacher_names as string) ?? "",
    studentCount: Number(r.student_count ?? 0),
    isPrimary: (r.is_primary as boolean) ?? false,
  }));
}

export async function getHalaqahDetail(halaqahId: string): Promise<HalaqahDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("halaqah_detail", { p_halaqah_id: halaqahId });
  if (error || !data) {
    console.error("halaqah_detail failed:", error?.message);
    return null;
  }
  const h = data as Record<string, unknown>;
  const row = h.halaqah as Record<string, unknown>;
  return {
    halaqah: {
      id: row.id as string,
      businessCode: row.business_code as string,
      name: row.name as string,
      description: (row.description as string) ?? "",
      status: row.status as string,
    },
    teachers: (h.teachers as HalaqahTeacher[]) ?? [],
    students: (h.students as HalaqahMember[]) ?? [],
    studentCount: Number(h.studentCount ?? 0),
    history: (h.history as HalaqahDetail["history"]) ?? [],
  };
}

export type AttendanceDay = {
  sessionId: string | null;
  generalNote: string | null;
  records: Record<string, { status: AttendanceStatus; note: string | null }>;
};

export async function getAttendanceDay(halaqahId: string, date: string): Promise<AttendanceDay> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_day", {
    p_halaqah_id: halaqahId,
    p_date: date,
  });
  if (error) {
    console.error("attendance_day failed:", error.message);
    return { sessionId: null, generalNote: null, records: {} };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    sessionId: (d.sessionId as string | null) ?? null,
    generalNote: (d.generalNote as string | null) ?? null,
    records: (d.records as AttendanceDay["records"]) ?? {},
  };
}

export type RekapRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persen: number;
};

export const getAttendanceRekap = cache(
  async (halaqahId: string, from: string, to: string): Promise<RekapRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attendance_rekap", {
      p_halaqah_id: halaqahId,
      p_from: from,
      p_to: to,
    });
    if (error) {
      console.error("attendance_rekap failed:", error.message);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      studentId: r.student_id as string,
      studentName: r.student_name as string,
      studentCode: r.student_code as string,
      hadir: Number(r.hadir ?? 0),
      izin: Number(r.izin ?? 0),
      sakit: Number(r.sakit ?? 0),
      alpa: Number(r.alpa ?? 0),
      persen: Number(r.persen ?? 0),
    }));
  }
);

export async function getStudentAttendanceSummary(
  studentId: string,
  from: string,
  to: string
): Promise<{ hadir: number; izin: number; sakit: number; alpa: number; persen: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_student_summary", {
    p_student_id: studentId,
    p_from: from,
    p_to: to,
  });
  const d = (data ?? {}) as Record<string, unknown>;
  if (error) {
    console.error("attendance_student_summary failed:", error.message);
  }
  return {
    hadir: Number(d.hadir ?? 0),
    izin: Number(d.izin ?? 0),
    sakit: Number(d.sakit ?? 0),
    alpa: Number(d.alpa ?? 0),
    persen: Number(d.persen ?? 0),
  };
}

/** Teacher options for pengampu selection (ADMIN). */
export async function getTeacherOptions(): Promise<{ id: string; name: string; code: string }[]> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("teachers")
    .select("id, full_name, business_code")
    .eq("tenant_id", profile.tenantId)
    .eq("status", "ACTIVE")
    .order("full_name");
  return (data ?? []).map((t) => ({ id: t.id, name: t.full_name, code: t.business_code }));
}

/**
 * Active students for member selection (ADMIN).
 * V12 FIX: join KELOMPOK ke halaqah_students sebelumnya memakai `!inner`
 * sehingga santri yang BELUM punya halaqah (baru dibuat) tidak pernah muncul
 * di dialog Anggota. Sekarang left join biasa + filter aktif per baris.
 */
export async function getStudentOptions(): Promise<
  { id: string; name: string; code: string; halaqahId: string | null }[]
> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      `id, full_name, business_code,
       memberships:halaqah_students (halaqah_id, left_at)`
    )
    .eq("tenant_id", profile.tenantId)
    .eq("status", "ACTIVE")
    .order("full_name");
  return (data ?? []).map((s) => {
    const memberships = (s.memberships as { halaqah_id: string; left_at: string | null }[]) ?? [];
    const active = memberships.find((m) => m.left_at === null);
    return {
      id: s.id,
      name: s.full_name,
      code: s.business_code,
      halaqahId: active?.halaqah_id ?? null,
    };
  });
}

/** Teacher dashboard counters (rule #39). */
export async function getTeacherV8Dashboard(): Promise<{
  halaqah: number;
  students: number;
  presentToday: number;
  totalToday: number;
}> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("v8_teacher_dashboard");
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    halaqah: Number(d.halaqah ?? 0),
    students: Number(d.students ?? 0),
    presentToday: Number(d.presentToday ?? 0),
    totalToday: Number(d.totalToday ?? 0),
  };
}

/** Recent sessions for the ustadz histori tab (last 10). */
export async function getTeacherRecentSessions(): Promise<
  { id: string; halaqahName: string; sessionDate: string; hadir: number; total: number }[]
> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      `id, session_date,
       halaqah:halaqahs (name),
       records:attendance_records (status)`
    )
    .eq("tenant_id", profile.tenantId)
    .order("session_date", { ascending: false })
    .limit(10);
  if (error) {
    console.error("recent sessions failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((s) => {
    const records = (s.records as { status: AttendanceStatus }[]) ?? [];
    const halaqah = (s.halaqah as { name: string } | null) ?? null;
    return {
      id: s.id as string,
      halaqahName: halaqah?.name ?? "-",
      sessionDate: s.session_date as string,
      hadir: records.filter((r) => r.status === "HADIR").length,
      total: records.length,
    };
  });
}
