import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchTahfidzGridAction } from "@/app/actions/tahfidz-grid";
import { TahfidzGridClient } from "./grid-client";

export const metadata = { title: "Tahfidz" };

/**
 * TAHFIZH V12.6 — Menu Tahfidz guru: grid penilaian langsung.
 *
 * Baris kiri = nama santri binaan, baris atas = daftar surat An-Nas →
 * An-Naba' (urutan seed V3). Guru memberi penilaian hafalan per sel dengan
 * mode CENTANG / HURUF / ANGKA; satu tombol Simpan menyinkronkan semua
 * perubahan. Data yang sama otomatis tampil di dasbor santri (satu tabel
 * tahfidz_assessments).
 */
export default async function UstadzTahfidzPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/tahfidz");
  const terms = await getTerminology(profile.tenantId);

  const grid = await fetchTahfidzGridAction();

  return (
    <div>
      <PageHeader
        title="Tahfidz"
        description={`Penilaian hafalan ${terms.santri.toLowerCase()} per surat — baris kiri nama ${terms.santri.toLowerCase()}, kolom surat An-Nas s.d. An-Naba'. Pilih mode Centang/Huruf/Angka lalu Simpan.`}
      />

      <TahfidzGridClient
        initialError={grid.error ?? null}
        students={grid.students ?? []}
        surahs={grid.rows ?? []}
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
