import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchLearningGridAction } from "@/app/actions/learning-grid";
import { LearningGridClient } from "@/app/ustadz/learning-grid";

export const metadata = { title: "Doa Harian" };

/**
 * TAHFIZH V12.8 — menu Doa Harian Koordinator: grid penilaian langsung
 * (judul kolom = materi, baris kiri = nama anak, centang/huruf/angka).
 */
export default async function KoordinatorDoaPage() {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/doa");
  const terms = await getTerminology(profile.tenantId);
  const grid = await fetchLearningGridAction("DOA");

  return (
    <div>
      <PageHeader
        title="Doa Harian"
        description={`Penilaian doa harian ${terms.santri.toLowerCase()} lembaga Anda — baris kiri nama ${terms.santri.toLowerCase()}, judul kolom = materi doa. Pilih mode Centang/Huruf/Angka lalu Simpan.`}
      />
      <LearningGridClient
        module="DOA"
        moduleLabel="Doa Harian"
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
