import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { JadwalBoard } from "@/components/jadwal/jadwal-board";
import { requireRole } from "@/lib/auth";
import { getJadwalBoard } from "@/lib/jadwal";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Jadwal" };

/**
 * TAHFIZH V47 — Jadwal (Master Data) untuk koordinator: pantau jadwal
 * seluruh halaqah lembaga + notifikasi presensi yang belum diisi.
 * Read-only — pengelolaan jadwal tetap milik admin.
 */
export default async function KoordinatorJadwalPage() {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/jadwal");
  const [board, terms] = await Promise.all([getJadwalBoard(), getTerminology(profile.tenantId)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal"
        description="Pantau hari & jam pembelajaran seluruh halaqah, serta presensi yang belum diisi."
        icon={<CalendarDays className="size-6" />}
      />
      <JadwalBoard
        board={board}
        studentLabel={terms.santri}
        halaqahs={[]}
        canManage={false}
        missingHrefTemplate="/koordinator/halaqah/%HALAQAH%"
      />
    </div>
  );
}
