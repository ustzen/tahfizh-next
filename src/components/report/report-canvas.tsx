"use client";

import { cn } from "@/lib/utils";
import type { ReportLayout, ReportData } from "@/lib/report-shared";
import { canvasSize } from "@/lib/report-shared";
import { ReportComponentContent, WatermarkLayer, type CanvasContext } from "./component-content";

/**
 * TAHFIZH V9 — renders a full report layout as printable page(s).
 * Used by preview, print view, and (zoomed) inside the builder.
 * Absolute positioning = WYSIWYG parity with the builder canvas (rule #34/#57).
 */

export type ReportCanvasProps = {
  layout: ReportLayout;
  ctx: CanvasContext;
  data: ReportData | null;
  logoUrl: string | null;
  watermarkUrl: string | null;
  paper: string;
  orientation: string;
  /** Interactive builder passes handlers; read-only views omit them. */
  selectedId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  renderComponentWrapper?: (
    comp: ReportLayout["pages"][number]["components"][number],
    children: React.ReactNode
  ) => React.ReactNode;
  className?: string;
};

export function ReportCanvas({
  layout,
  ctx,
  data,
  logoUrl,
  watermarkUrl,
  paper,
  orientation,
  selectedId,
  onSelectComponent,
  renderComponentWrapper,
  className,
}: ReportCanvasProps) {
  const { w, h } = canvasSize(paper, orientation);
  const pages = layout.pages.length > 0 ? layout.pages : [{ components: [] }];

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          data-report-page={pageIndex}
          onClick={onSelectComponent ? () => onSelectComponent(null) : undefined}
          className={cn(
            "report-page relative shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-slate-200",
            onSelectComponent && "cursor-default"
          )}
          style={{ width: w, height: h }}
        >
          <WatermarkLayer
            watermarkUrl={watermarkUrl}
            opacity={data?.institution?.watermark?.opacity ?? 15}
            scale={data?.institution?.watermark?.scale ?? 60}
            canvasW={w}
            canvasH={h}
          />

          {page.components
            .filter((c) => !c.hidden)
            .map((comp) => {
              const content = (
                <ReportComponentContent
                  comp={comp}
                  ctx={ctx}
                  data={data}
                  logoUrl={logoUrl}
                  watermarkUrl={watermarkUrl}
                />
              );
              const wrapper = renderComponentWrapper ? renderComponentWrapper(comp, content) : content;
              const isSelected = selectedId != null && selectedId === comp.id;

              return (
                <div
                  key={comp.id}
                  data-component-id={comp.id}
                  onClick={
                    onSelectComponent
                      ? (e) => {
                          e.stopPropagation();
                          onSelectComponent(comp.id);
                        }
                      : undefined
                  }
                  className={cn(
                    "absolute",
                    onSelectComponent && "cursor-move",
                    isSelected && "outline outline-2 outline-blue-500"
                  )}
                  style={{
                    left: comp.x,
                    top: comp.y,
                    width: comp.w,
                    height: comp.h,
                    zIndex: comp.z,
                  }}
                >
                  {wrapper}
                </div>
              );
            })}

          {/* Page number footer (rule #24) */}
          {data?.institution?.showPageNumbers !== false && pages.length > 1 ? (
            <div className="absolute inset-x-0 bottom-2 text-center text-[10px] text-slate-400">
              Halaman {pageIndex + 1} dari {pages.length}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
