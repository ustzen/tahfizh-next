import { requireRole } from "@/lib/auth";
import { getTeacherStudentsDetailed } from "@/lib/teacher-students";
import { getTeacherStudentRanks } from "@/lib/teacher-student-rank";
import { PageHeader } from "@/components/dashboard/section";
import { getTerminology } from "@/lib/terminology";
import { getTeacherRankSettings } from "@/lib/rank-settings";
import { RankSettingsPanel } from "./rank-settings-panel";
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
  // tenant-scoped) bila RPC gagal/kosong. V45: + peringkat & skor per halaqah.
  const [students, ranks, rankSettings] = await Promise.all([
    getTeacherStudentsDetailed(),
    getTeacherStudentRanks(),
    getTeacherRankSettings(),
  ]);

  return (
    <div>
      <PageHeader
        title={`${terms.santri} Halaqah Saya`}
        description={`${terms.santri} di halaqah yang Anda ampu — 1 guru bisa mengampu lebih dari 1 halaqah.`}
      />

      {/* V78 — kriteria peringkat & skala nilai huruf yang diatur guru */}
      <div className="mb-4">
        <RankSettingsPanel settings={rankSettings} />
      </div>

      <SantriClient
        students={students}
        ranks={ranks}
        scale={rankSettings.scale}
        santriLabel={terms.santri}
        halaqahLabel={terms.halaqah}
      />
    </div>
  );
}
