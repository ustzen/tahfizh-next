import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSemesters, getActiveYear } from "@/lib/akademik";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { MutationManager } from "@/components/akademik/mutation-manager";

export const metadata = { title: "Mutasi & Status Santri" };

/**
 * TAHFIZH V11 — Mutasi santri antar halaqah, naik level, dan status (#29-#42).
 * Server authorization ada di RPC; halaman ini hanya memformat data.
 */
export default async function AdminMutasiPage() {
  const profile = await requireRole(["ADMIN", "KOORDINATOR"], "/admin/akademik/mutasi");
  const supabase = await createClient();
  const tid = profile.tenantId!;

  const [studentsRes, halaqahs, activeYear, terms] = await Promise.all([
    supabase
      .from("students")
      .select(
        `id, business_code, full_name, status,
         halaqah_id:halaqah_students(halaqah_id, left_at),
         enrollments:student_enrollments(level, semester_id, academic_years(status))`
      )
      .eq("tenant_id", tid)
      .order("business_code"),
    getAdminHalaqahList(),
    getActiveYear(),
    getTerminology(profile.tenantId),
  ]);

  const students = (studentsRes.data ?? []).map((s) => {
    const memberships = (s.halaqah_id as { halaqah_id: string; left_at: string | null }[]) ?? [];
    const activeMembership = memberships.find((m) => m.left_at === null);
    const enrollments =
      (s.enrollments as unknown as {
        level: string | null;
        semester_id: string;
        academic_years: { status: string } | null;
      }[]) ?? [];
    const yearActive = enrollments.find((e) => e.academic_years?.status === "ACTIVE");
    const firstEnrollment = enrollments[0];
    return {
      id: s.id,
      code: s.business_code,
      name: s.full_name,
      status: s.status,
      halaqahId: activeMembership?.halaqah_id ?? null,
      halaqahName: null as string | null,
      level: (yearActive ?? firstEnrollment)?.level ?? null,
    };
  });

  // Resolve halaqah names for badges.
  const nameById = new Map(halaqahs.map((h) => [h.id, h.name]));
  for (const st of students) {
    st.halaqahName = st.halaqahId ? nameById.get(st.halaqahId) ?? null : null;
  }

  const semesterOptions =
    activeYear != null
      ? (await getSemesters(activeYear.id)).map((sem) => ({ id: sem.id, name: `${sem.name} · Semester ${sem.sequence}` }))
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mutasi & Status Santri"
        description={`Pindah ${terms.halaqah.toLowerCase()}, naik level, dan kelola status ${terms.santri.toLowerCase()}. ID santri tetap dan seluruh riwayat tersimpan.`}
      />
      <MutationManager
        students={students}
        halaqahs={halaqahs.map((h) => ({ id: h.id, name: h.name, code: h.businessCode }))}
        halaqahLabel={terms.halaqah}
        semesterOptions={semesterOptions}
        canMutate={profile.role === "ADMIN" || profile.role === "KOORDINATOR"}
      />
    </div>
  );
}
