import { requireRole } from "@/lib/auth";
import { getTeacherStudentsDetailed } from "@/lib/teacher-students";
import { PageHeader } from "@/components/dashboard/section";
import { getTerminology } from "@/lib/terminology";
import { SantriClient } from "./santri-client";

export const metadata = { title: "Santri Halaqah Saya" };

/**
 * TAHFIZH V21.2 — Menu Data Santri guru: kini bisa difilter per halaqah
 * (lihat SantriClient). Fetch data & terminologi tetap di server; filter
 * & render tabel dipindah ke client component agar interaktif.
 */
export default async function UstadzSantriPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/santri");
  const terms = await getTerminology(profile.tenantId);

  // V12.10: data binaan lengkap via helper bersama — RPC SECURITY DEFINER
  // `teacher_students_list` + fallback baca langsung jalur halaqah (RLS
  // tenant-scoped) bila RPC gagal/kosong.
  const students = await getTeacherStudentsDetailed();

  return (
    <div>
      <PageHeader
        title={`${terms.santri} Halaqah Saya`}
        description={`${terms.santri} di halaqah yang Anda ampu — 1 guru bisa mengampu lebih dari 1 halaqah.`}
      />

      <SantriClient students={students} santriLabel={terms.santri} halaqahLabel={terms.halaqah} />
    </div>
  );
}
