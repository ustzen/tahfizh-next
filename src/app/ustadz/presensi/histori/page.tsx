import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getTeacherRecentSessions } from "@/lib/halaqah";
import { Badge } from "@/components/ui/badge";
import { formatDateID } from "@/lib/halaqah-shared";

export const metadata = { title: "Histori Presensi" };

/** TAHFIZH V8 — histori 10 sesi terakhir guru (rule: histori kehadiran). */
export default async function UstadzPresensiHistoriPage() {
  await requireRole(["USTADZ"], "/ustadz/presensi");
  const sessions = await getTeacherRecentSessions();

  return (
    <div className="space-y-6">
      <PageHeader title="Histori Presensi" description="10 sesi presensi terakhir halaqah Anda." />
      {sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada data presensi.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{formatDateID(s.sessionDate)}</p>
                <p className="text-xs text-muted-foreground">{s.halaqahName}</p>
              </div>
              <Badge className="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Hadir {s.hadir}/{s.total}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
