import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getReportAssetUrl, getReportDetail, getReportSettings } from "@/lib/report";
import { ReportPreview } from "@/components/report/report-preview";

export const metadata = { title: "Preview Raport" };

/** TAHFIZH V9 — Guru preview raport binaan (rule #51: cek data, tanpa edit layout). */
export default async function UstadzReportPreviewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/raport");
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
      backHref="/ustadz/raport"
      backLabel="Kembali ke Raport"
    />
  );
}
