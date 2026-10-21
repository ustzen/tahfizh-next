"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileCheck2, Inbox, LockOpen, Printer, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReportListItem } from "@/lib/report";
import { deleteReportAction, finalizeReportAction, reopenReportAction } from "@/app/actions/report";
import { formatDateID } from "@/components/report/component-content";

function StatusPill({ status }: { status: string }) {
  const isFinal = status === "FINAL";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        isFinal
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", isFinal ? "bg-emerald-500" : "bg-amber-500")}
      />
      {isFinal ? "Final" : "Draft"}
    </span>
  );
}

function IconButton({
  href,
  onClick,
  title,
  disabled,
  tone,
  children,
}: {
  href?: string;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  tone?: "ok" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const cls = cn(
    "size-7 px-0 text-muted-foreground/70 transition hover:bg-role-soft hover:text-role-strong",
    tone === "ok" && "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10",
    tone === "warn" && "hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10",
    tone === "danger" && "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
  );
  if (href) {
    return (
      <Link href={href}>
        <Button size="icon" variant="ghost" className={cls} title={title}>
          {children}
        </Button>
      </Link>
    );
  }
  return (
    <Button size="icon" variant="ghost" className={cls} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/**
 * TAHFIZH V72 — daftar raport santri (rombak total): baris lebih lega,
 * status pill dengan titik warna, dan aksi ikon halus. Logic aksi tidak
 * berubah — Admin (full), Koordinator (baca), Ustadz (binaannya, baca).
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
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
        <Inbox className="mx-auto size-7 text-role" />
        <p className="mt-2 text-sm font-semibold text-foreground">Belum ada raport</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {emptyHint ?? "Belum ada raport."}
        </p>
      </div>
    );
  }

  return (
    <div className="aria-busy:opacity-60 overflow-x-auto rounded-2xl border border-border/60 shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-role-soft/60 hover:bg-role-soft/60">
            <TableHead className="rounded-tl-2xl">Santri</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="rounded-tr-2xl text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((r) => (
            <TableRow key={r.id} className="transition-colors">
              <TableCell>
                <p className="text-sm font-semibold text-foreground">{r.studentName}</p>
              </TableCell>
              <TableCell>
                <p className="text-sm text-foreground/85">{r.title}</p>
                <p className="text-xs text-muted-foreground/80">
                  {r.templateName} • {r.academicYear}
                </p>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.periodLabel ?? `${formatDateID(r.periodStart)} — ${formatDateID(r.periodEnd)}`}
              </TableCell>
              <TableCell>
                <StatusPill status={r.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center justify-end gap-0.5">
                  <IconButton href={`${previewBase}/${r.id}`} title="Pratinjau / Cetak">
                    <Printer className="size-3.5" />
                  </IconButton>
                  {canFinalize ? (
                    r.status === "DRAFT" ? (
                      <IconButton
                        title="Finalkan (snapshot)"
                        disabled={pending}
                        tone="ok"
                        onClick={() => run(() => finalizeReportAction({ reportId: r.id }))}
                      >
                        <FileCheck2 className="size-3.5" />
                      </IconButton>
                    ) : (
                      <IconButton
                        title="Buka kembali untuk revisi"
                        disabled={pending}
                        tone="warn"
                        onClick={() => run(() => reopenReportAction({ reportId: r.id }))}
                      >
                        <LockOpen className="size-3.5" />
                      </IconButton>
                    )
                  ) : null}
                  {canFinalize && r.status === "DRAFT" ? (
                    <IconButton
                      title="Hapus draft"
                      disabled={pending}
                      tone="danger"
                      onClick={() => run(() => deleteReportAction({ reportId: r.id }))}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
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
