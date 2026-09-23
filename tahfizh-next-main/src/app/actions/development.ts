"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { v11ErrorMessage, assertWaliOfStudent } from "@/lib/akademik";

/**
 * TAHFIZH V11 — Riwayat Perkembangan feed (#43-#47).
 * Server-side authorization (#48/#55): ADMIN/KOORDINATOR = whole tenant,
 * USTADZ = assigned students only, WALI_SANTRI = own children, DEVELOPER = no
 * tenant academic access. The RPC enforces the same rules (defense in depth).
 */

export type DevelopmentEvent = {
  eventDate: string;
  kind: string;
  title: string;
  detail: string | null;
  teacher: string | null;
  scoreLabel: string | null;
};

export type DevelopmentPage = {
  rows: DevelopmentEvent[];
  error?: string;
};

export async function fetchDevelopmentPageAction(
  studentId: string,
  opts: { limit: number; offset: number; kind?: string; from?: string; to?: string }
): Promise<DevelopmentPage> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId) return { rows: [], error: "Akses ditolak." };

  // Ownership pre-check mirroring the RPC (rule #74).
  const supabase = await createClient();
  if (profile.role === "USTADZ") {
    const { data: teacher } = await supabase
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
      });
    const { data: assigned } = teacher
      ? await supabase
          .from("teacher_students")
          .select("id")
          .eq("teacher_id", teacher.id)
          .eq("student_id", studentId)
          .maybeSingle()
      : { data: null };
    if (!assigned) return { rows: [], error: "Santri ini bukan tanggung jawab Anda." };
  } else if (profile.role === "WALI_SANTRI") {
    if (!(await assertWaliOfStudent(studentId)))
      return { rows: [], error: "Santri ini bukan anak Anda." };
  } else if (!["ADMIN", "KOORDINATOR"].includes(profile.role)) {
    return { rows: [], error: "Akses ditolak." };
  }

  const { data, error } = await supabase.rpc("development_feed", {
    p_student_id: studentId,
    p_limit: Math.min(Math.max(opts.limit, 1), 100),
    p_offset: Math.max(opts.offset, 0),
    p_kind: opts.kind || null,
    p_from: opts.from || null,
    p_to: opts.to || null,
  });
  if (error) return { rows: [], error: v11ErrorMessage(error.message) };

  const rows = (data ?? []).map((e: {
    event_date: string;
    kind: string;
    title: string;
    detail: string | null;
    teacher: string | null;
    score_label: string | null;
  }) => ({
    eventDate: e.event_date,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    teacher: e.teacher,
    scoreLabel: e.score_label,
  }));
  return { rows };
}
