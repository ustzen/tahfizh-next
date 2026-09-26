import type { Metadata } from "next";
import { Target as TargetIcon, Flag } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getTargetProgress } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import { moduleLabel, persen, targetScopeLabel } from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Target" };

/** Warna aksen tiap jenis target — konsisten dengan menu Target guru. */
const CATEGORY_ACCENT: Record<string, { chip: string; bar: string }> = {
  TAHFIDZ: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  HADITS: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  DOA: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

/**
 * Target (versi baru) — papan target per anak per jenis (Tahfidz / Hadits /
 * Doa). Progress dihitung dari penilaian guru pada periode cakupan target
 * (1 tahun ajaran / semester ganjil / semester genap) langsung di database.
 */
export default async function SantriTargetPage() {
  await requireRole(["WALI_SANTRI"], "/santri/target");
  const targets = await getTargetProgress();

  const perAnak = new Map<string, typeof targets>();
  for (const t of targets) {
    const list = perAnak.get(t.studentName) ?? [];
    list.push(t);
    perAnak.set(t.studentName, list);
  }

  return (
    <div>
      <PageHeader
        title="Target Pembelajaran"
        description="Apa saja yang harus dicapai ananda — ditetapkan guru untuk halaqahnya, progres terhitung otomatis."
        icon={<TargetIcon className="size-6" />}
      />

      {targets.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="violet"
            icon={<Flag />}
            title="Belum ada target aktif"
            description="Guru belum menetapkan target untuk halaqah ananda. Target akan muncul setelah guru mengaturnya di menu Target."
          />
        </CardBox>
      ) : (
        <div className="space-y-5">
          {[...perAnak.entries()].map(([nama, list]) => (
            <CardBox key={nama}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-role-strong text-lg font-bold tracking-tight">{nama}</p>
                <span className="text-muted-foreground text-xs">{list[0]?.halaqahName ?? "-"}</span>
              </div>

              <ul className="space-y-5">
                {list.map((t) => {
                  const pct = Math.min(persen(t.capaian, t.targetValue), 100);
                  const tercapai = t.capaian >= t.targetValue;
                  const accent = CATEGORY_ACCENT[t.category] ?? CATEGORY_ACCENT.TAHFIDZ;
                  const items = (t.items ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
                  return (
                    <li key={t.targetId}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {moduleLabel(t.category)}
                          <span className="text-muted-foreground font-normal"> — {targetScopeLabel(t.scope)}</span>
                        </p>
                        <span className="tabular text-sm font-bold">
                          {t.capaian}
                          <span className="text-muted-foreground font-normal">/{t.targetValue} tercapai</span>
                        </span>
                      </div>

                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-500/20">
                        <div
                          className={cn("h-full rounded-full", tercapai ? "bg-emerald-500" : accent.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant={tercapai ? "success" : "info"}>
                          {tercapai ? "🎉 Tercapai" : `${pct}% berjalan`}
                        </Badge>
                        {t.teacherName && (
                          <span className="text-muted-foreground text-xs">Oleh {t.teacherName}</span>
                        )}
                        {t.description && (
                          <span className="text-muted-foreground text-xs">· {t.description}</span>
                        )}
                      </div>

                      {items.length > 0 && (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {items.map((it, i) => (
                            <li
                              key={`${it}-${i}`}
                              className={cn("rounded-lg px-2 py-1 text-xs font-medium", accent.chip)}
                            >
                              {it}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardBox>
          ))}
        </div>
      )}
    </div>
  );
}
