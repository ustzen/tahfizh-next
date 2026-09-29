import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { ensureSantriSelfLink, getPrestasiCards } from "@/lib/santri-pantauan";
import { createClient } from "@/lib/supabase/server";
import { IbadahJournal, type IbadahActivity, type IbadahLogRow } from "@/components/ibadah/ibadah-journal";

export const metadata: Metadata = { title: "Jurnal Ibadah" };

/** Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta. */
function todayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

type ActivityRow = { id: string; label: string; icon: string; tone: string; is_builtin: boolean };
type LogRow = { student_id: string; activity_id: string; log_date: string; done: boolean };

/**
 * TAHFIZH V51 — Jurnal Ibadah harian santri/wali.
 * Katalog kegiatan dari RPC `ibadah_activities_list` (bawaan platform +
 * tambahan lembaga); isian 30 hari terakhir dari `ibadah_log_page`.
 */
export default async function SantriJurnalIbadahPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/jurnal-ibadah");
  const supabase = await createClient();

  // Layout /santri juga memanggil ini, tapi layout & page dirender paralel —
  // tanpa panggilan ulang di sini, tautan akun→santri bisa belum ada saat
  // query di bawah jalan (kids kosong → kartu tidak bisa diklik). Idempoten.
  await ensureSantriSelfLink();

  // Anak milik akun ini: guardian → guardian_students → students.
  const kidsRes = await supabase
    .from("guardians")
    .select("guardian_students(student_id, students(full_name))")
    .eq("profile_id", profile.id);
  type GuardianRow = {
    guardian_students: { student_id: string; students: { full_name: string }[] | null }[];
  };
  let kids = ((kidsRes.data ?? []) as unknown as GuardianRow[]).flatMap((g) =>
    (g.guardian_students ?? []).map((m) => ({
      studentId: m.student_id,
      name: m.students?.[0]?.full_name ?? "Ananda",
    }))
  );

  // Fallback: kartu prestasi sudah berisi studentId + nama — dipakai bila
  // embed guardian gagal (mis. relasi wali dibuat belakangan).
  if (kids.length === 0) {
    const cards = await getPrestasiCards();
    kids = cards.map((c) => ({ studentId: c.studentId, name: c.studentName }));
  }

  const today = todayJakarta();
  const from = new Date(today + "T00:00:00");
  from.setDate(from.getDate() - 29);
  const fromDate = from.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const [actRes, logRes] = await Promise.all([
    supabase.rpc("ibadah_activities_list"),
    supabase.rpc("ibadah_log_page", { p_from: fromDate, p_to: today }),
  ]);

  const activities: IbadahActivity[] = ((actRes.data ?? []) as ActivityRow[])
    .filter((a) => a.is_builtin !== false || true) // katalog aktif saja sudah difilter di RPC
    .map((a) => ({
      id: a.id,
      label: a.label,
      icon: a.icon,
      tone: a.tone,
      isBuiltin: a.is_builtin,
    }));

  const logs: IbadahLogRow[] = ((logRes.data ?? []) as LogRow[]).map((l) => ({
    studentId: l.student_id,
    activityId: l.activity_id,
    logDate: l.log_date,
    done: l.done,
  }));

  // Strip 7 hari: 6 hari lalu → hari ini.
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jurnal Ibadah"
        description="Catat ibadah harian ananda — sholat, muraja'ah, tilawah, dan lainnya. Tersimpan otomatis setiap dicentang."
      />
      <IbadahJournal
        kids={kids}
        activities={activities}
        initialLogs={logs}
        days={days}
        today={today}
        canManage={false}
      />
    </div>
  );
}
