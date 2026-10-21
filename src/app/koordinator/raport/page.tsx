import Link from "next/link";
import { FileCheck2, FileClock, LayoutTemplate } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminReportList, getReportTemplateGallery } from "@/lib/report";
import { TemplateGallery } from "@/components/report/template-gallery";
import { RaportStatStrip } from "@/components/report/raport-stat-strip";
import { ReportListTable } from "@/components/report/report-list-table";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V72 — Koordinator (rombak total): ikut memilih & menyunting bentuk
 * raport lembaga, lalu memantau raport santri. Finalisasi & hapus tetap
 * kewenangan ADMIN. Hanya penataan ulang visual — data & aksi tidak berubah.
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
    <div className="space-y-7">
      <PageHeader
        title="Raport"
        description="Atur bentuk raport lembaga dan pantau raport santri sebelum diterbitkan."
      />

      <RaportStatStrip
        items={[
          {
            label: "Template lembaga",
            value: templates.filter((t) => t.scope === "TENANT").length,
            icon: <LayoutTemplate />,
            chip: "bg-role-soft text-role-strong",
          },
          {
            label: "Menunggu finalisasi",
            value: draft,
            icon: <FileClock />,
            chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
          },
          {
            label: "Raport final",
            value: final,
            icon: <FileCheck2 />,
            chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
          },
        ]}
      />

      <TemplateGallery templates={templates} basePath="/koordinator/raport" role="KOORDINATOR" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Raport Santri</h2>
          <p className="text-xs text-muted-foreground">Finalisasi raport dilakukan oleh Admin lembaga.</p>
        </div>
        <ReportListTable
          reports={reports}
          canFinalize={false}
          previewBase="/koordinator/raport/preview"
          emptyHint="Belum ada raport pada lembaga ini."
        />
      </section>
    </div>
  );
}
