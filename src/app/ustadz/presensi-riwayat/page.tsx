import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import {
  getTeacherHalaqahList,
  getAttendanceHistoryPage,
  getAttendanceLeaderboard,
  PAGE_SIZE_PRESENSI,
} from "@/lib/halaqah";
import { getActiveYear, getSemesters } from "@/lib/akademik";
import { AttendanceHistoryTable } from "@/components/halaqah/attendance-history-table";
import { AttendanceLeaderboard } from "@/components/halaqah/attendance-leaderboard";
import { AttendancePeriodBar, type PresensiPeriode } from "@/components/halaqah/attendance-period-bar";

export const metadata = { title: "Riwayat Presensi" };

function isoOf(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * TAHFIZH V48 — Riwayat Presensi: menu tersendiri di bawah Presensi.
 * Rangkuman 10 santri paling rajin & paling sering absen (alpa+izin+sakit
 * digabung), bisa disortir per bulan/semester/tahun ajaran; plus tabel
 * riwayat sesi per tanggal terpaginasi 10/halaman.
 */
export default async function UstadzPresensiRiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ halaqah?: string; hal?: string; periode?: string; bulan?: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/presensi-riwayat");
  const sp = await searchParams;

  const halaqahList = await getTeacherHalaqahList();
  const selectedId =
    sp.halaqah && halaqahList.some((h) => h.id === sp.halaqah)
      ? sp.halaqah
      : halaqahList[0]?.id ?? "";
  const page = Math.max(0, (Number.parseInt(sp.hal ?? "1", 10) || 1) - 1);

  // ---- Periode: bulan / semester 1-2 / tahun ajaran / semua ----
  const periode: PresensiPeriode =
    sp.periode && ["bulan", "smt1", "smt2", "tahun", "semua"].includes(sp.periode)
      ? (sp.periode as PresensiPeriode)
      : "bulan";
  const now = new Date();
  const bulan =
    sp.bulan && /^\d{1,2}$/.test(sp.bulan) && Number(sp.bulan) >= 1 && Number(sp.bulan) <= 12
      ? Number(sp.bulan)
      : now.getMonth() + 1;

  const activeYear = await getActiveYear();
  const semesters = activeYear ? await getSemesters(activeYear.id) : [];

  function periodeRange(): { from: string | null; to: string | null } {
    const y = now.getFullYear();
    if (periode === "semua") return { from: null, to: null };
    if (periode === "bulan") {
      return {
        from: isoOf(new Date(y, bulan - 1, 1)),
        to: isoOf(new Date(y, bulan, 0)),
      };
    }
    // Semester/tahun memakai kalender tahun ajaran aktif bila tersedia.
    if (activeYear && semesters.length === 2) {
      const [s1, s2] = semesters;
      if (periode === "smt1") return { from: s1.startDate, to: s1.endDate };
      if (periode === "smt2") return { from: s2.startDate, to: s2.endDate };
      return { from: activeYear.startDate, to: activeYear.endDate };
    }
    // Fallback tanpa tahun ajaran: semester 1 = Jan–Jun, semester 2 = Jul–Des.
    if (periode === "smt1") return { from: `${y}-01-01`, to: `${y}-06-30` };
    if (periode === "smt2") return { from: `${y}-07-01`, to: `${y}-12-31` };
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  const { from, to } = periodeRange();

  const [history, leaderboard] = selectedId
    ? await Promise.all([
        getAttendanceHistoryPage(selectedId, page),
        getAttendanceLeaderboard(selectedId, from, to),
      ])
    : [{ rows: [], total: 0 }, { rajin: [], alpa: [], unavailable: false }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Presensi"
        description="Rangkuman rajin/absen + riwayat sesi; bisa disortir per bulan, semester, atau tahun ajaran."
      />

      {halaqahList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Anda belum menjadi pengampu halaqah apa pun. Hubungi admin lembaga.
        </p>
      ) : (
        <>
          <AttendancePeriodBar
            basePath="/ustadz/presensi-riwayat"
            halaqahId={selectedId}
            periode={periode}
            bulan={bulan}
            activeYear={activeYear}
          />
          <AttendanceLeaderboard
            rajin={leaderboard.rajin}
            alpa={leaderboard.alpa}
            unavailable={leaderboard.unavailable}
          />
          <AttendanceHistoryTable
            halaqahId={selectedId}
            basePath="/ustadz/presensi-riwayat"
            rows={history.rows}
            total={history.total}
            page={page}
            pageSize={PAGE_SIZE_PRESENSI}
            periode={periode}
            bulan={bulan}
          />
        </>
      )}
    </div>
  );
}
