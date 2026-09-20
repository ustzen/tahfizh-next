import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportLiveData, getReportSettings, getTemplateDetail, getReportAssetUrl } from "@/lib/report";
import { ReportBuilder } from "@/components/report/report-builder";
import { saveReportTemplateLayoutAction } from "@/app/actions/report-layout";
import type { CanvasContext } from "@/components/report/component-content";
import { SAMPLE_REPORT_DATA } from "@/lib/report-shared";

export const metadata = { title: "Report Builder" };

/**
 * TAHFIZH V9 — Report Builder host page (rule #7/#52). ADMIN edits the
 * TENANT template copy; live student data (optional ?report= / ?student=)
 * drives the WYSIWYG preview values.
 */
export default async function ReportBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ report?: string; student?: string }>;
}) {
  const profile = await requireRole(["ADMIN"], "/admin/raport");
  const { templateId } = await params;
  const sp = await searchParams;

  const template = await getTemplateDetail(templateId);
  if (!template) notFound();
  // Tenant isolation: ADMIN may only edit own tenant's (or instantiate of) template.
  if (template.tenantId && template.tenantId !== profile.tenantId) redirect("/admin/raport");

  const settings = await getReportSettings();
  const logoUrl = await getReportAssetUrl(settings.logoPath);
  const watermarkUrl = await getReportAssetUrl(settings.watermarkPath);

  // Prefer an existing report's student/period; fall back to the first student
  // of the tenant purely for preview values (never persisted).
  let ctx: CanvasContext = {
    title: "RAPORT TAHFIZH",
    academicYear: "2026/2027",
    semesterLabel: "Semester 1",
    periodLabel: null,
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
  };
  let data: Awaited<ReturnType<typeof getReportLiveData>> = null;
  if (sp.report) {
    const { getReportDetail } = await import("@/lib/report");
    const detail = await getReportDetail(sp.report);
    if (detail && detail.status === "DRAFT") {
      ctx = {
        title: detail.title,
        academicYear: detail.academicYear,
        semesterLabel: detail.semesterLabel,
        periodLabel: detail.periodLabel,
        periodStart: detail.periodStart,
        periodEnd: detail.periodEnd,
      };
      data = detail.data;
    }
  }
  if (!data && sp.student) {
    data = await getReportLiveData(sp.student, ctx.periodStart, ctx.periodEnd);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Report Builder"
        description={`${template.name} — geser, ubah ukuran, sembunyikan, atau kunci komponen.`}
      />
      <ReportBuilder
        templateId={template.id}
        initialName={template.name}
        paper={template.paper}
        orientation={template.orientation}
        initialLayout={template.layout ?? { pages: [{ components: [] }] }}
        ctx={ctx}
        // Tanpa santri terpilih, builder memakai data contoh agar layout
        // terlihat sebagaimana hasil cetaknya (tidak pernah ikut tersimpan).
        data={data ?? SAMPLE_REPORT_DATA}
        logoUrl={logoUrl}
        watermarkUrl={watermarkUrl}
        saveAction={async (layout) => saveReportTemplateLayoutAction({ templateId: template.id, layout })}
      />
    </div>
  );
}
