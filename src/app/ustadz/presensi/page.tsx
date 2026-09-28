import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import {
  getTeacherHalaqahList,
  getHalaqahDetail,
  getAttendanceDay,
  getAttendanceHistoryPage,
  PAGE_SIZE_PRESENSI,
} from "@/lib/halaqah";
import { AttendanceHistoryTable } from "@/components/halaqah/attendance-history-table";
import { AttendanceSheet } from "./attendance-sheet";
import { todayISO, type AttendanceEntry } from "@/lib/halaqah-shared";

export const metadata = { title: "Presensi" };

/**
 * TAHFIZH V8 — Guru quick attendance (rule #13/#24). Default = first halaqah,
 * today's date. If attendance was already saved for the selected day it is
 * pre-loaded (rule #33) so the guru edits rather than re-enters.
 * ?halaqah= & ?tanggal= keep the URL shareable without full reloads.
 */
export default async function UstadzPresensiPage({
  searchParams,
}: {
  searchParams: Promise<{ halaqah?: string; tanggal?: string; hal?: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/presensi");
  const sp = await searchParams;

  const halaqahList = await getTeacherHalaqahList();
  const options = halaqahList.map((h) => ({
    id: h.id,
    name: h.name,
    studentCount: h.studentCount,
  }));

  const selectedId = sp.halaqah && options.some((o) => o.id === sp.halaqah) ? sp.halaqah : options[0]?.id ?? "";
  const date = sp.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal) ? sp.tanggal : todayISO();
  // V47 — halaman riwayat (?hal=1-based, default 1 = 10 terbaru).
  const historyPage = Math.max(0, (Number.parseInt(sp.hal ?? "1", 10) || 1) - 1);

  let students: { id: string; name: string; code: string; gender: "L" | "P" }[] = [];
  let initialEntries: Record<string, AttendanceEntry> = {};
  let generalNote = "";
  let history: { rows: Awaited<ReturnType<typeof getAttendanceHistoryPage>>["rows"]; total: number } = { rows: [], total: 0 };
  if (selectedId) {
    const [detail, day, hist] = await Promise.all([
      getHalaqahDetail(selectedId),
      getAttendanceDay(selectedId, date),
      getAttendanceHistoryPage(selectedId, historyPage),
    ]);
    students = detail?.students ?? [];
    for (const s of students) {
      const saved = day.records[s.id];
      initialEntries[s.id] = {
        status: saved?.status ?? null,
        note: saved?.note ?? "",
      };
    }
    generalNote = day.generalNote ?? "";
    history = hist;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Presensi"
        description="Pilih halaqah & tanggal → klik H/I/S/A → ubah yang berbeda → Simpan."
      />
      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Anda belum menjadi pengampu halaqah apa pun. Hubungi admin lembaga.
        </p>
      ) : (
        <>
          <AttendanceSheet
            key={`${selectedId}-${date}`}
            halaqahOptions={options}
            initialHalaqahId={selectedId}
            initialDate={date}
            initialGeneralNote={generalNote}
            students={students}
            initialEntries={initialEntries}
          />
          <AttendanceHistoryTable
            halaqahId={selectedId}
            basePath="/ustadz/presensi"
            rows={history.rows}
            total={history.total}
            page={historyPage}
            pageSize={PAGE_SIZE_PRESENSI}
          />
        </>
      )}
    </div>
  );
}
