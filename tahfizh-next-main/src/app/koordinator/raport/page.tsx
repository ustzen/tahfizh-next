import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminReportList, getReportTemplateGallery } from "@/lib/report";
import { ReportListTable } from "@/components/report/report-list-table";
import { TemplateGallery } from "@/components/report/template-gallery";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V13 — Koordinator: ikut memilih & menyunting bentuk raport lembaga,
 * lalu memantau raport santri. Finalisasi & hapus tetap kewenangan ADMIN.
 */
export default async function KoordinatorRaportPage() {
  await requireRole(["KOORDINATOR"], "/koordinator/raport");
  const [templates, reports] = await Promise.all([
    getReportTemplateGallery(),
    getAdminReportList(),
  ]);

  const final = reports.filter((r) => r.status === "FINAL").length;
  const draft = reports.length - final;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Raport"
        description="Atur bentuk raport lembaga dan pantau raport santri sebelum diterbitkan."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-role/15 bg-role-soft/50 p-4">
          <p className="text-xs text-muted-foreground">Raport final</p>
          <p className="text-2xl font-bold text-role-strong">{final}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
          <p className="text-xs text-muted-foreground">Menunggu finalisasi</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{draft}</p>
        </div>
      </div>

      <TemplateGallery templates={templates} basePath="/koordinator/raport" role="KOORDINATOR" />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Raport Santri</h2>
        <ReportListTable
          reports={reports}
          canFinalize={false}
          previewBase="/koordinator/raport/preview"
          emptyHint="Belum ada raport pada lembaga ini."
        />
      </div>
    </div>
  );
}
