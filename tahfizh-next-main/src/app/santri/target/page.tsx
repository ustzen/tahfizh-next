import type { Metadata } from "next";
import { Target as TargetIcon, Flag } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getTargetProgress } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import { moduleLabel, persen, tanggalId } from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Target" };

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
        description="Target yang ditetapkan guru untuk halaqah ananda, beserta capaian ananda sendiri."
        icon={<TargetIcon className="size-6" />}
      />

      {targets.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="violet"
            icon={<Flag />}
            title="Belum ada target aktif"
            description="Guru atau koordinator belum menetapkan target untuk halaqah ananda."
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

              <ul className="space-y-4">
                {list.map((t) => {
                  const pct = Math.min(persen(t.capaian, t.targetValue), 100);
                  const tercapai = t.capaian >= t.targetValue;
                  const lewatTempo = new Date(t.endDate) < new Date() && !tercapai;
                  return (
                    <li key={t.targetId}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {moduleLabel(t.category)}
                          {t.description ? (
                            <span className="text-muted-foreground font-normal"> — {t.description}</span>
                          ) : null}
                        </p>
                        <span className="tabular text-sm font-bold">
                          {t.capaian}
                          <span className="text-muted-foreground font-normal">/{t.targetValue}</span>
                        </span>
                      </div>

                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-500/20">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            tercapai ? "bg-emerald-500" : lewatTempo ? "bg-rose-500" : "bg-sky-500"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant={tercapai ? "success" : lewatTempo ? "danger" : "info"}>
                          {tercapai ? "Tercapai" : lewatTempo ? "Lewat tempo" : `${pct}% berjalan`}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {tanggalId(t.startDate)} – {tanggalId(t.endDate)}
                          {t.teacherName ? ` · ${t.teacherName}` : ""}
                        </span>
                      </div>
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
