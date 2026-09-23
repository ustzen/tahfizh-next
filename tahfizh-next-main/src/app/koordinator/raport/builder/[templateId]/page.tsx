import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getTemplateDetail } from "@/lib/report";
import { ReportBuilder } from "@/components/report/report-builder";
import { saveReportTemplateLayoutAction } from "@/app/actions/report-layout";
import { SAMPLE_REPORT_CTX, SAMPLE_REPORT_DATA } from "@/lib/report-shared";

export const metadata = { title: "Report Builder" };

/**
 * TAHFIZH V13 — Koordinator boleh menyunting layout template milik lembaganya
 * dan menyimpannya. Template global (tenant_id null) tetap milik Developer.
 */
export default async function KoordinatorReportBuilderPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/raport");
  const { templateId } = await params;

  const template = await getTemplateDetail(templateId);
  if (!template) notFound();
  if (!template.tenantId || template.tenantId !== profile.tenantId) redirect("/koordinator/raport");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Report Builder"
        description={`${template.name} — geser, ubah ukuran, sembunyikan, atau kunci komponen, lalu tekan Simpan.`}
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
