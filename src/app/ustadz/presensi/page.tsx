import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getTeacherHalaqahList, getHalaqahDetail, getAttendanceDay } from "@/lib/halaqah";
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
  searchParams: Promise<{ halaqah?: string; tanggal?: string }>;
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

  let students: { id: string; name: string; code: string; gender: "L" | "P" }[] = [];
  let initialEntries: Record<string, AttendanceEntry> = {};
  let generalNote = "";
  if (selectedId) {
    const [detail, day] = await Promise.all([
      getHalaqahDetail(selectedId),
      getAttendanceDay(selectedId, date),
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
        <AttendanceSheet
          key={`${selectedId}-${date}`}
          halaqahOptions={options}
          initialHalaqahId={selectedId}
          initialDate={date}
          initialGeneralNote={generalNote}
          students={students}
          initialEntries={initialEntries}
        />
      )}
    </div>
  );
}
