import { notFound, redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getReportAssetUrl, getReportDetail, getReportSettings } from "@/lib/report";
import { ReportPreview } from "@/components/report/report-preview";

export const metadata = { title: "Preview Raport" };

/**
 * TAHFIZH V9 — Admin preview (rule #34). FINAL renders the immutable
 * snapshot (rule #31/#67); DRAFT renders live learning data.
 */
export default async function AdminReportPreviewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const profile = await requireRole(["ADMIN"], "/admin/raport");
  const { reportId } = await params;

  const detail = await getReportDetail(reportId);
  if (!detail) notFound();

  const settings = await getReportSettings();
  const logoUrl = await getReportAssetUrl(settings.logoPath);
  const watermarkUrl = await getReportAssetUrl(settings.watermarkPath);

  if (!detail.layout || !detail.data) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Layout raport belum tersedia. Buka Report Builder untuk menyusun template terlebih dahulu.
      </div>
    );
  }

  return (
    <ReportPreview
      layout={detail.layout}
      ctx={{
        title: detail.title,
        academicYear: detail.academicYear,
        semesterLabel: detail.semesterLabel,
        periodLabel: detail.periodLabel,
        periodStart: detail.periodStart,
        periodEnd: detail.periodEnd,
      }}
      data={detail.data}
      logoUrl={logoUrl}
      watermarkUrl={watermarkUrl}
      paper={detail.paper}
      orientation={detail.orientation}
      backHref="/admin/raport"
      backLabel="Kembali ke Raport"
      banner={
        detail.status === "FINAL" ? (
          <p className="no-print flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <FileWarning className="h-4 w-4" /> Raport final — tampil dari snapshot yang tidak berubah.
          </p>
        ) : (
          <p className="no-print rounded-lg bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Draft — nilai mengikuti data terbaru modul pembelajaran. Finalkan untuk membekukan data.
          </p>
        )
      }
    />
  );
}
