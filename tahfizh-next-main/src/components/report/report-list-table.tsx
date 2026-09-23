"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Eye, FileCheck2, LockOpen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReportListItem } from "@/lib/report";
import { deleteReportAction, finalizeReportAction, reopenReportAction } from "@/app/actions/report";
import { formatDateID } from "@/components/report/component-content";

/**
 * TAHFIZH V9 — report list used by Admin (full actions), Koordinator
 * (read-only), and Ustadz (own students, read-only). Rule #49-#51.
 */
export function ReportListTable({
  reports,
  canFinalize,
  emptyHint,
  previewBase = "/admin/raport/preview",
}: {
  reports: ReportListItem[];
  canFinalize: boolean;
  emptyHint?: string;
  /** V13 — setiap role punya route preview sendiri (admin/koordinator/ustadz). */
  previewBase?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const res = await fn().catch(() => ({ error: "Raport belum berhasil disimpan. Silakan coba lagi." }));
      if (!res.error) router.refresh();
    });
  }

  if (reports.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground/80">{emptyHint ?? "Belum ada raport."}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-role-soft/60">
            <TableHead>Santri</TableHead>
            <TableHead>Judul</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <p className="text-sm font-medium text-foreground">{r.studentName}</p>
              </TableCell>
              <TableCell>
                <p className="text-sm text-foreground/85">{r.title}</p>
                <p className="text-xs text-muted-foreground/80">{r.templateName} • {r.academicYear}</p>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.periodLabel ?? `${formatDateID(r.periodStart)} — ${formatDateID(r.periodEnd)}`}
              </TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    r.status === "FINAL" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  )}
                >
                  {r.status === "FINAL" ? "Final" : "Draft"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Link href={`${previewBase}/${r.id}`}>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Eye className="h-3 w-3" />
                    </Button>
                  </Link>
                  {canFinalize ? (
                    r.status === "DRAFT" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-emerald-600 dark:text-emerald-300"
                        disabled={pending}
                        title="Finalkan (snapshot)"
                        onClick={() => run(() => finalizeReportAction({ reportId: r.id }))}
                      >
                        <FileCheck2 className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-amber-600 dark:text-amber-300"
                        disabled={pending}
                        title="Buka kembali untuk revisi"
                        onClick={() => run(() => reopenReportAction({ reportId: r.id }))}
                      >
                        <LockOpen className="h-3 w-3" />
                      </Button>
                    )
                  ) : null}
                  {canFinalize && r.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-red-600 dark:text-red-300"
                      disabled={pending}
                      onClick={() => run(() => deleteReportAction({ reportId: r.id }))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
