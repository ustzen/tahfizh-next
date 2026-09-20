import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAttendanceDay, getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { AttendanceSheet } from "@/app/ustadz/presensi/attendance-sheet";
import { todayISO, type AttendanceEntry } from "@/lib/halaqah-shared";

export const metadata = { title: "Presensi Halaqah" };

/** TAHFIZH V8 — tab Presensi langsung dari detail halaqah (rule #12). */
export default async function UstadzHalaqahPresensiPage({
  params,
  searchParams,
}: {
  params: Promise<{ halaqahId: string }>;
  searchParams: Promise<{ tanggal?: string }>;
}) {
  const profile = await requireRole(["USTADZ"], "/ustadz/halaqah");
  const { halaqahId } = await params;
  const sp = await searchParams;

  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  const date = sp.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal) ? sp.tanggal : todayISO();
  const day = await getAttendanceDay(halaqahId, date);
  const initialEntries: Record<string, AttendanceEntry> = {};
  for (const s of detail.students) {
    const saved = day.records[s.id];
    initialEntries[s.id] = { status: saved?.status ?? null, note: saved?.note ?? "" };
  }

  return (
    <div className="space-y-5">
      <PageHeader title={`Presensi — ${detail.halaqah.name}`} description="Klik H/I/S/A → Simpan." />
      <HalaqahTabs halaqahId={halaqahId} role="ustadz" halaqahLabel={terms.halaqah} studentLabel={terms.santri} />
      <AttendanceSheet
        key={`${halaqahId}-${date}`}
        halaqahOptions={[
          { id: detail.halaqah.id, name: detail.halaqah.name, studentCount: detail.studentCount },
        ]}
        initialHalaqahId={halaqahId}
        initialDate={date}
        initialGeneralNote={day.generalNote ?? ""}
        students={detail.students}
        initialEntries={initialEntries}
      />
    </div>
  );
}
