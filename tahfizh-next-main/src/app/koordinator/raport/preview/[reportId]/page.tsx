import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getReportAssetUrl, getReportDetail, getReportSettings } from "@/lib/report";
import { ReportPreview } from "@/components/report/report-preview";

export const metadata = { title: "Preview Raport" };

/** TAHFIZH V9 — Koordinator preview (rule #50). Read-only. */
export default async function KoordinatorReportPreviewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireRole(["KOORDINATOR"], "/koordinator/raport");
  const { reportId } = await params;

  const detail = await getReportDetail(reportId);
  if (!detail) notFound();

  const settings = await getReportSettings();
  const logoUrl = await getReportAssetUrl(settings.logoPath);
  const watermarkUrl = await getReportAssetUrl(settings.watermarkPath);

  if (!detail.layout || !detail.data) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Layout raport belum tersedia.
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
      backHref="/koordinator/raport"
      backLabel="Kembali ke Raport"
    />
  );
}
