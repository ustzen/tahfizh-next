import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportAssetUrl, getReportSettings } from "@/lib/report";
import { ReportSettingsForm } from "@/components/report/report-settings-form";

export const metadata = { title: "Pengaturan Raport" };

/**
 * TAHFIZH V9 — tenant report settings (rule #18-#24): alamat, kontak,
 * footer, watermark, logo (storage tenant-isolated, rule #19/#69).
 */
export default async function AdminRaportPengaturanPage() {
  await requireRole(["ADMIN"], "/admin/raport/pengaturan");
  const settings = await getReportSettings();
  const logoUrl = await getReportAssetUrl(settings.logoPath);
  const watermarkUrl = await getReportAssetUrl(settings.watermarkPath);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Raport"
        description="Identitas lembaga, footer, dan watermark untuk seluruh raport lembaga Anda."
      />
      <ReportSettingsForm settings={settings} logoUrl={logoUrl} watermarkUrl={watermarkUrl} />
    </div>
  );
}
