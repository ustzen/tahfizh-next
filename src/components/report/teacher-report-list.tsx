"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/** TAHFIZH V9 — mobile-friendly card list for guru (rule #46/#51). */
export function TeacherReportList({ reports }: { reports: Item[] }) {
  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
        Belum ada raport untuk santri halaqah Anda.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((r) => (
        <div
          key={r.id}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-4 shadow-card",
            r.status === "FINAL" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
          )}
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">{r.studentName}</p>
              </div>
              <Badge
                className={cn(r.status === "FINAL" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}
              >
                {r.status === "FINAL" ? "Final" : "Draft"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{r.title}</p>
            <p className="text-[11px] text-muted-foreground/80">
              {r.academicYear} • {r.semesterLabel}
            </p>
          </div>
          <Link href={`/ustadz/raport/preview/${r.id}`} className="mt-3">
            <Button size="sm" variant="outline" className="w-full text-xs">
              <Eye className="mr-1 h-3.5 w-3.5" /> Lihat Raport
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}
