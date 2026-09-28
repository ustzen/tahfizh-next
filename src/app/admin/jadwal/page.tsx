import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { JadwalBoard } from "@/components/jadwal/jadwal-board";
import { requireRole } from "@/lib/auth";
import { getJadwalBoard } from "@/lib/jadwal";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Jadwal" };

/**
 * TAHFIZH V47 — Jadwal (Master Data) untuk admin: kelola sesi pembelajaran
 * per halaqah + notifikasi tanggal lewat yang belum dipresensi.
 */
export default async function AdminJadwalPage() {
  const profile = await requireRole(["ADMIN"], "/admin/jadwal");
  const [board, halaqahs, terms] = await Promise.all([
    getJadwalBoard(),
    getAdminHalaqahList(),
    getTerminology(profile.tenantId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal"
        description="Atur hari & jam pembelajaran per halaqah. Presensi yang belum diisi pada tanggal lewat muncul sebagai notifikasi."
        icon={<CalendarDays className="size-6" />}
      />
      <JadwalBoard
        board={board}
        studentLabel={terms.santri}
        halaqahs={halaqahs.map((h) => ({ id: h.id, name: h.name, code: h.businessCode }))}
        canManage
        missingHrefTemplate="/admin/halaqah/%HALAQAH%"
      />
    </div>
  );
}
