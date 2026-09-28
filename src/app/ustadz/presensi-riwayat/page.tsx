import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import {
  getTeacherHalaqahList,
  getAttendanceHistoryPage,
  getAttendanceLeaderboard,
  PAGE_SIZE_PRESENSI,
} from "@/lib/halaqah";
import { AttendanceHistoryTable } from "@/components/halaqah/attendance-history-table";
import { AttendanceLeaderboard } from "@/components/halaqah/attendance-leaderboard";
import { HalaqahFilterBar } from "@/components/halaqah/halaqah-filter-bar";

export const metadata = { title: "Riwayat Presensi" };

/**
 * TAHFIZH V48 — Riwayat Presensi sebagai menu tersendiri (di bawah Presensi):
 * tabel rekap per tanggal (10 sesi/halaman) + rangkuman 10 santri paling rajin
 * dan 10 paling sering tidak hadir, dengan filter halaqah milik guru.
 */
export default async function UstadzPresensiRiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ halaqah?: string; hal?: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/presensi-riwayat");
  const sp = await searchParams;

  const halaqahList = await getTeacherHalaqahList();
  const selectedId =
    sp.halaqah && halaqahList.some((h) => h.id === sp.halaqah)
      ? sp.halaqah
      : halaqahList[0]?.id ?? "";
  const page = Math.max(0, (Number.parseInt(sp.hal ?? "1", 10) || 1) - 1);

  const [history, leaderboard] = selectedId
    ? await Promise.all([
        getAttendanceHistoryPage(selectedId, page),
        getAttendanceLeaderboard(selectedId),
      ])
    : [{ rows: [], total: 0 }, { rajin: [], alpa: [] }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Presensi"
        description="Rekap sesi per tanggal dan rangkuman santri paling rajin & paling sering tidak hadir."
      />

      {halaqahList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Anda belum menjadi pengampu halaqah apa pun. Hubungi admin lembaga.
        </p>
      ) : (
        <>
          {/* Filter halaqah (URL-driven, pola PeriodFilter tanpa rentang tanggal) */}
          <HalaqahFilterBar
            basePath="/ustadz/presensi-riwayat"
            halaqahId={selectedId}
            options={halaqahList.map((h) => ({ id: h.id, name: h.name }))}
          />

          <AttendanceLeaderboard rajin={leaderboard.rajin} alpa={leaderboard.alpa} />

          <AttendanceHistoryTable
            halaqahId={selectedId}
            basePath="/ustadz/presensi-riwayat"
            rows={history.rows}
            total={history.total}
            page={page}
            pageSize={PAGE_SIZE_PRESENSI}
          />
        </>
      )}
    </div>
  );
}
