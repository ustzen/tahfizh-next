import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { Badge } from "@/components/ui/badge";
import { formatDateID } from "@/lib/halaqah-shared";

export const metadata = { title: "Aktivitas Halaqah" };

/**
 * TAHFIZH V8 — tab Aktivitas: ringkasan histori perpindahan anggota
 * (rule #10/#12 — "Aktivitas cukup berupa ringkasan").
 */
export default async function AdminHalaqahAktivitasPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const profile = await requireRole(["ADMIN"], "/admin/halaqah");
  const { halaqahId } = await params;
  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <PageHeader title={`Aktivitas — ${detail.halaqah.name}`} description="Histori keanggotaan & perpindahan." />
      <HalaqahTabs
        halaqahId={halaqahId}
        role="admin"
        halaqahLabel={terms.halaqah}
        studentLabel={terms.santri}
        tabs={[{ key: "aktivitas", label: "Aktivitas" }]}
      />

      {detail.history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada histori keanggotaan.
        </p>
      ) : (
        <div className="space-y-2">
          {detail.history.map((h, i) => (
            <div
              key={`${h.studentName}-${h.joinedAt}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-card"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{h.studentName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateID(h.joinedAt)} — {h.leftAt ? formatDateID(h.leftAt) : "sekarang"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-muted-foreground">{h.halaqahName}</Badge>
                {h.leftAt ? (
                  <Badge variant="outline" className="border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300">
                    <History className="mr-1 h-3 w-3" /> pindah
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">aktif</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
