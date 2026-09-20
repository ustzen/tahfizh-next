import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Verify the student is one of this teacher's assigned students and return
 * the minimal display row. Returns null when the relationship does not exist
 * (rule #55: cross-teacher/cross-tenant access must be refused).
 */
export async function getStudentRowForTeacher(teacherId: string, studentId: string) {
  const supabase = await createClient();
  const { data: rel } = await supabase
    .from("teacher_students")
    .select("id, students(business_code, full_name)")
    .eq("teacher_id", teacherId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!rel) return null;
  const s = rel.students as unknown as { business_code: string; full_name: string } | null;
  if (!s) return null;

  return { businessCode: s.business_code, fullName: s.full_name };
}
