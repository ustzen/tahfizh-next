import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getTemplateDetail } from "@/lib/report";
import { ReportBuilder } from "@/components/report/report-builder";
import { saveReportTemplateLayoutAction } from "@/app/actions/report-layout";
import { SAMPLE_REPORT_CTX, SAMPLE_REPORT_DATA } from "@/lib/report-shared";

export const metadata = { title: "Report Builder — Developer" };

/** TAHFIZH V9 — Developer mengedit layout template GLOBAL (rule #4). */
export default async function DeveloperReportBuilderPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const profile = await requireRole(["DEVELOPER"], "/developer/raport");
  const { templateId } = await params;

  const template = await getTemplateDetail(templateId);
  if (!template) notFound();
  // Global templates have tenant_id = null; tenant templates are ADMIN-only.
  if (template.tenantId && template.tenantId !== profile.tenantId) redirect("/developer/raport");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Report Builder"
        description={`${template.name} — template global — ditampilkan dengan data contoh; lembaga melihat data aslinya di salinan masing-masing.`}
      />
      <ReportBuilder
        templateId={template.id}
        initialName={template.name}
        paper={template.paper}
        orientation={template.orientation}
        initialLayout={template.layout ?? { pages: [{ components: [] }] }}
        ctx={SAMPLE_REPORT_CTX}
        data={SAMPLE_REPORT_DATA}
        logoUrl={null}
        watermarkUrl={null}
        saveAction={async (layout) => saveReportTemplateLayoutAction({ templateId: template.id, layout })}
      />
    </div>
  );
}
