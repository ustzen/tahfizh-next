import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchTugasGridAction } from "@/app/actions/tugas-halaqah";
import { TugasGridClient } from "./tugas-grid-client";

export const metadata = { title: "Tugas" };

/**
 * TAHFIZH V12.8 — Menu Tugas guru: grid penilaian tugas halaqah.
 *
 * Guru memberikan tugas untuk SEMUA santri di halaqah yang diampu. Tampilan
 * seperti tabel penilaian: baris kiri = nama santri, kolom = tugas (judul +
 * tanggal + tombol ×), kolom terakhir = % & nilai. Mode penilaian dapat
 * diganti kapan saja: Centang / Huruf / Angka (3 mode pilihan guru).
 */
export default async function UstadzTugasPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/tugas");
  const terms = await getTerminology(profile.tenantId);

  const grid = await fetchTugasGridAction();

  return (
    <div>
      <PageHeader
        title="Tugas"
        description={`Beri tugas untuk seluruh ${terms.santri.toLowerCase()} halaqah, lalu nilai langsung dari grid — pilih mode Centang, Huruf, atau Angka.`}
      />

      <TugasGridClient
        initialError={grid.error ?? null}
        halaqah={grid.halaqah ?? []}
        tasks={grid.tasks ?? []}
        students={grid.students ?? []}
        initialScores={grid.scores ?? {}}
      />
    </div>
  );
}
