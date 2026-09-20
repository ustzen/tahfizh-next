import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTargetDetail, getTargetHistory } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressControls } from "./progress-controls";
import { TARGET_MODULE_LABELS, targetPercent, targetStatusLabel, targetStatusStyle, type TargetModule } from "@/lib/v7-shared";
import { cn } from "@/lib/utils";

export const metadata = { title: "Detail Target" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default async function TargetDetailPage({
  params,
}: {
  params: Promise<{ targetId: string }>;
}) {
  const { targetId } = await params;
  const profile = await requireRole(["USTADZ"], `/ustadz/target/${targetId}`);
  const terms = await getTerminology(profile.tenantId);

  const target = await getTargetDetail(targetId);
  if (!target) notFound();

  const history = await getTargetHistory(targetId);
  const pct = targetPercent(target.currentValue, target.targetValue);
  const isCustom = target.moduleType === "CUSTOM";
  const cancellable = target.status !== "DIBATALKAN" && target.status !== "TERCAPAI";

  return (
    <div>
      <PageHeader
        title={target.title}
        description={`${target.studentName} — ${TARGET_MODULE_LABELS[target.moduleType as TargetModule] ?? target.moduleType}`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="border-role/25 text-role-strong hover:bg-role-soft">
              <Link href={`/ustadz/target/${targetId}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ustadz/target">
                <ArrowLeft className="size-4" /> Daftar Target
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Rule #48: visual progress card */}
          <Card className="shadow-card rounded-2xl">
            <CardContent className="px-5 py-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-role uppercase">🎯 Target</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{target.title}</p>
                  {target.description && (
                    <p className="text-muted-foreground mt-1 text-sm">{target.description}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                    targetStatusStyle(target.status)
                  )}
                >
                  {targetStatusLabel(target.status)}
                </span>
              </div>

              <div className="mb-1.5 h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    target.status === "TERCAPAI"
                      ? "bg-emerald-500"
                      : target.status === "TERLAMBAT"
                        ? "bg-amber-500"
                        : "bg-gradient-brand"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {target.currentValue} / {target.targetValue} {target.unit ?? ""}
                </span>
                <span className="font-bold text-foreground">{pct}%</span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Periode</dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(target.startDate)} — {formatDate(target.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Guru</dt>
                  <dd className="font-medium text-foreground">{target.teacherName ?? "—"}</dd>
                </div>
                {target.note && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Catatan</dt>
                    <dd className="font-medium text-foreground">{target.note}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Rule #10/#12: real progress control — manual for custom, data for modules */}
          <ProgressControls
            targetId={target.id}
            isCustom={isCustom}
            currentValue={target.currentValue}
            targetValue={target.targetValue}
            status={target.status}
          />
        </div>

        {/* Rule #14/#58: history */}
        <Card className="shadow-card h-fit rounded-2xl">
          <CardHeader>
            <CardTitle>Histori Perubahan</CardTitle>
            <CardDescription>Semua perubahan progress & status.</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">Belum ada perubahan.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="bg-gradient-brand absolute -left-[21px] top-1 size-2.5 rounded-full" />
                    <p className="text-sm font-medium text-foreground">
                      {h.oldValue === null ? "Dibuat" : `${h.oldValue} → ${h.newValue}`}{" "}
                      {h.newStatus ? `· ${targetStatusLabel(h.newStatus)}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(h.createdAt)} · {h.source === "AUTO" ? "Otomatis dari data" : h.source === "CREATE" ? "Saat dibuat" : "Manual"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
