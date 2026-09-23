"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReportCanvas } from "@/components/report/report-canvas";
import type { ReportLayout, ReportData } from "@/lib/report-shared";
import type { CanvasContext } from "@/components/report/component-content";
import { cn } from "@/lib/utils";

/**
 * TAHFIZH V9 — print-accurate preview (rule #34/#35/#57). The window.print()
 * pipeline relies on the global @media print CSS which isolates
 * .report-print-root, so pages print at exact size.
 */
export function ReportPreview({
  layout,
  ctx,
  data,
  logoUrl,
  watermarkUrl,
  paper,
  orientation,
  backHref,
  backLabel = "Kembali",
  banner,
}: {
  layout: ReportLayout;
  ctx: CanvasContext;
  data: ReportData | null;
  logoUrl: string | null;
  watermarkUrl: string | null;
  paper: string;
  orientation: string;
  backHref: string;
  backLabel?: string;
  banner?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> {backLabel}
          </Button>
        </Link>
        <Button
          size="sm"
          className="bg-primary text-white"
          onClick={() => window.print()}
        >
          <Printer className="mr-1 h-4 w-4" /> Cetak / PDF
        </Button>
      </div>

      {banner}

      <div className="report-print-root flex flex-col items-center gap-6 bg-slate-100 p-4 sm:p-6">
        <ReportCanvas
          layout={layout}
          ctx={ctx}
          data={data}
          logoUrl={logoUrl}
          watermarkUrl={watermarkUrl}
          paper={paper}
          orientation={orientation}
        />
      </div>

      <p className={cn("no-print text-center text-xs text-slate-400")}>
        Gunakan “Cetak / PDF” lalu pilih tujuan “Save as PDF” untuk menghasilkan PDF dengan layout yang sama.
      </p>
    </div>
  );
}
