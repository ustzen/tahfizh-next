import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { JadwalBoard } from "@/components/jadwal/jadwal-board";
import { requireRole } from "@/lib/auth";
import { getJadwalBoard } from "@/lib/jadwal";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Jadwal" };

/**
 * TAHFIZH V47 — Jadwal untuk guru: sesi mengajar halaqah yang diampu, dengan
 * notifikasi tanggal lewat yang belum dipresensi (klik → langsung ke lembar
 * presensi halaqah & tanggal tersebut). Dipindah dari /admin/akademik/jadwal.
 */
export default async function UstadzJadwalPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/jadwal");
  const [board, terms] = await Promise.all([getJadwalBoard(), getTerminology(profile.tenantId)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal"
        description="Sesi mengajar mingguan Anda. Jadwal yang sudah lewat tanpa presensi ditandai agar tidak terlewat."
        icon={<CalendarDays className="size-6" />}
      />
      <JadwalBoard
        board={board}
        studentLabel={terms.santri}
        halaqahs={[]}
        canManage={false}
        missingHrefTemplate="/ustadz/presensi?halaqah=%HALAQAH%&tanggal=%TANGGAL%"
      />
    </div>
  );
}
