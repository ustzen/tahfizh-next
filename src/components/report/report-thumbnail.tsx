"use client";

import { cn } from "@/lib/utils";
import { canvasSize, firstPageOnly } from "@/lib/report-shared";
import type { ReportData, ReportLayout } from "@/lib/report-shared";
import { ReportCanvas } from "@/components/report/report-canvas";
import type { CanvasContext } from "@/components/report/component-content";

/**
 * TAHFIZH V13 — pratinjau raport ukuran kecil.
 * Merender halaman pertama layout dengan renderer yang SAMA dengan hasil cetak
 * (ReportCanvas), lalu diperkecil memakai CSS transform — jadi yang dilihat di
 * galeri benar-benar bentuk raportnya, bukan gambar tiruan.
 */
export function ReportThumbnail({
  layout,
  ctx,
  data,
  paper,
  orientation,
  width = 264,
  logoUrl = null,
  watermarkUrl = null,
  className,
}: {
  layout: ReportLayout;
  ctx: CanvasContext;
  data: ReportData | null;
  paper: string;
  orientation: string;
  width?: number;
  logoUrl?: string | null;
  watermarkUrl?: string | null;
  className?: string;
}) {
  const { w, h } = canvasSize(paper, orientation);
  const scale = width / w;
  const pageCount = layout.pages.length;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200",
        className
      )}
      style={{ width, height: Math.round(h * scale) }}
      aria-hidden
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      >
        <ReportCanvas
          layout={firstPageOnly(layout)}
          ctx={ctx}
          data={data}
          logoUrl={logoUrl}
          watermarkUrl={watermarkUrl}
          paper={paper}
          orientation={orientation}
          className="gap-0"
        />
      </div>
      {pageCount > 1 ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {pageCount} halaman
        </span>
      ) : null}
    </div>
  );
}
