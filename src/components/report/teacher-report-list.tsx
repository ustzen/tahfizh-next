"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  studentName: string;
  studentCode: string;
  academicYear: string;
  semesterLabel: string;
  status: string;
};

/**
 * TAHFIZH V72 — daftar raport santri untuk guru (rombak total): kartu dengan
 * garis aksen status, identitas lebih kuat, dan tombol kaca cetak yang jelas.
 */
function StatusPill({ status }: { status: string }) {
  const isFinal = status === "FINAL";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        isFinal
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", isFinal ? "bg-emerald-500" : "bg-amber-500")} />
      {isFinal ? "Final" : "Draft"}
    </span>
  );
}

export function TeacherReportList({ reports }: { reports: Item[] }) {
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
        <p className="text-sm font-semibold text-foreground">Belum ada raport santri</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Rapor santri halaqah Anda akan tampil di sini setelah diterbitkan Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((r) => {
        const isFinal = r.status === "FINAL";
        return (
          <div
            key={r.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-card-lg"
          >
            <span
              aria-hidden
              className={cn("h-1 w-full", isFinal ? "bg-emerald-400" : "bg-amber-400")}
            />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{r.studentName}</p>
                  <p className="text-[11px] text-muted-foreground/80">{r.studentCode}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-xs text-foreground/85">{r.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.academicYear} • {r.semesterLabel}
                </p>
              </div>
              <Link href={`/ustadz/raport/preview/${r.id}`} className="mt-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs transition-colors hover:bg-role-soft hover:text-role-strong"
                >
                  <Printer className="mr-1 size-3.5" /> Lihat Raport
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
