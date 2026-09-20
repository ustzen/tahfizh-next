import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";

import { fetchTajwidGridAction } from "@/app/actions/tajwid-grid";
import { TajwidGridClient } from "./tajwid-grid-client";

export const metadata = { title: "Tajwid" };

/**
 * TAHFIZH V12.9 — Menu Tajwid guru: grid penguasaan materi.
 *
 * Sistem sama dengan menu Tugas: guru menambahkan materi tajwid (Mad,
 * Dengung, Iqlab, …) — materi berlaku untuk lembaga — lalu menilai penguasaan
 * tiap santri binaan di grid. Mode penilaian 3 pilihan (Centang = Menguasai /
 * Huruf / Angka) bisa diganti kapan saja langsung dari menu.
 */
export default async function UstadzTajwidPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/tajwid");
  const terms = await getTerminology(profile.tenantId);

  const grid = await fetchTajwidGridAction();

  return (
    <div>
      <PageHeader
        title="Tajwid"
        description={`Tambahkan materi tajwid (Mad, Dengung, dll.), lalu nilai penguasaan ${terms.santri.toLowerCase()} halaqah langsung dari grid — pilih mode Centang, Huruf, atau Angka.`}
      />

      <TajwidGridClient
        initialError={grid.error ?? null}
        materi={grid.materi ?? []}
        students={grid.students ?? []}
        initialScores={grid.scores ?? {}}
      />
    </div>
  );
}
