import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchLearningGridAction } from "@/app/actions/learning-grid";
import { LearningGridClient } from "@/app/ustadz/learning-grid";

export const metadata = { title: "Hadits" };

/**
 * TAHFIZH V12.8 — menu Hadits Koordinator: grid penilaian langsung
 * (judul kolom = materi, baris kiri = nama anak, centang/huruf/angka).
 */
export default async function KoordinatorHaditsPage() {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/hadits");
  const terms = await getTerminology(profile.tenantId);
  const grid = await fetchLearningGridAction("HADITS");

  return (
    <div>
      <PageHeader
        title="Hadits"
        description={`Penilaian hadits ${terms.santri.toLowerCase()} lembaga Anda — baris kiri nama ${terms.santri.toLowerCase()}, judul kolom = materi hadits. Pilih mode Centang/Huruf/Angka lalu Simpan.`}
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
