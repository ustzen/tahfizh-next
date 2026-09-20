import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchLearningGridAction } from "@/app/actions/learning-grid";
import { LearningGridClient } from "@/app/ustadz/learning-grid";

export const metadata = { title: "Hadits" };

/**
 * TAHFIZH V12.8 — Menu Hadits guru: grid penilaian langsung.
 *
 * Header kolom = materi hadits lembaga, baris kiri = nama anak binaan.
 * Guru menilai per sel dengan mode Centang/Huruf/Angka lalu Simpan massal.
 * Detail per santri tetap tersedia di /ustadz/hadits/[studentId].
 */
export default async function UstadzHaditsPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/hadits");
  const terms = await getTerminology(profile.tenantId);

  const grid = await fetchLearningGridAction("HADITS");

  return (
    <div>
      <PageHeader
        title="Hadits"
        description={`Penilaian hadits ${terms.santri.toLowerCase()} halaqah Anda — baris kiri nama ${terms.santri.toLowerCase()}, judul kolom = materi hadits. Pilih mode Centang/Huruf/Angka lalu Simpan.`}
      />

      <LearningGridClient
        module="HADITS"
        moduleLabel="Hadits"
        initialError={grid.error ?? null}
        students={grid.students ?? []}
        materials={grid.materials ?? []}
        grades={grid.grades ?? []}
        initialCells={Object.fromEntries(
          Object.entries(grid.cells ?? {}).map(([k, v]) => [
            k,
            { status: v.status as "BELUM" | "DIPELAJARI" | "DINILAI", scoreLabel: v.scoreLabel, scoreValue: v.scoreValue },
          ])
        )}
      />
    </div>
  );
}
