import Link from "next/link";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAttendanceRekap, getTeacherHalaqahList } from "@/lib/halaqah";
import { RekapTable } from "@/components/halaqah/rekap-table";
import { PeriodFilter } from "@/components/halaqah/period-filter";

export const metadata = { title: "Rekap Presensi" };

/**
 * TAHFIZH V8 — rekap per santri (rule #35/#36): H/I/S/A + persentase with
 * Hari/Minggu/Bulan/Custom filters (default: bulan berjalan).
 */
export default async function UstadzPresensiRekapPage({
  searchParams,
}: {
  searchParams: Promise<{ halaqah?: string; dari?: string; sampai?: string; periode?: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/presensi");
  const sp = await searchParams;

  const halaqahList = await getTeacherHalaqahList();
  const selectedId =
    sp.halaqah && halaqahList.some((h) => h.id === sp.halaqah)
      ? sp.halaqah
      : halaqahList[0]?.id ?? "";

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;
  const from = sp.dari && /^\d{4}-\d{2}-\d{2}$/.test(sp.dari) ? sp.dari : monthStart;
  const to = sp.sampai && /^\d{4}-\d{2}-\d{2}$/.test(sp.sampai) ? sp.sampai : monthEnd;

  const rows = selectedId ? await getAttendanceRekap(selectedId, from, to) : [];
  const halaqahName = halaqahList.find((h) => h.id === selectedId)?.name ?? "-";

  return (
    <div className="space-y-6">
      <PageHeader title="Rekap Presensi" description={`Rekap ${halaqahName} — persentase kehadiran per santri.`} />
      <PeriodFilter
        basePath="/ustadz/presensi/rekap"
        halaqahId={selectedId}
        halaqahOptions={halaqahList.map((h) => ({ id: h.id, name: h.name }))}
        from={from}
        to={to}
      />
      <RekapTable rows={rows} />
      <p className="text-center text-xs text-muted-foreground/80">
        Butuh input harian? Buka{" "}
        <Link href="/ustadz/presensi" className="font-medium text-role hover:underline">
          Presensi
        </Link>
        .
      </p>
    </div>
  );
}
