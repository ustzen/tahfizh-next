import Link from "next/link";
import { ArrowRight, FileCheck2, FilePlus2, FileText, Layers } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminReportList, getReportTemplateGallery } from "@/lib/report";
import { TemplateGallery } from "@/components/report/template-gallery";
import { RaportStatStrip } from "@/components/report/raport-stat-strip";
import { ReportListTable } from "@/components/report/report-list-table";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V72 — Admin Raport (rombak total).
 * Sorotan "Raport Utama Lembaga", galeri template & contoh bawaan, lalu daftar
 * raport santri yang baru dibuat. Data & aksi tidak berubah — hanya penataan.
 */
export default async function AdminRaportPage() {
  await requireRole(["ADMIN"], "/admin/raport");
  const [templates, reports] = await Promise.all([
    getReportTemplateGallery(),
    getAdminReportList(),
  ]);

  const draft = reports.filter((r) => r.status === "DRAFT").length;
  const final = reports.filter((r) => r.status === "FINAL").length;
  const mine = templates.filter((t) => t.scope === "TENANT");
  const primary = mine.find((t) => t.isPrimary) ?? null;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Raport"
        description="Pilih bentuk raport, ubah sesuai lembaga Anda, lalu tetapkan sebagai raport utama."
        action={
          primary ? (
            <Link href={`/admin/raport/buat?template=${primary.id}`}>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-role px-4 py-2 text-sm font-semibold text-role-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-card-lg">
                <FilePlus2 className="size-4" /> Buat Raport Santri
              </span>
            </Link>
          ) : undefined
        }
      />

      <RaportStatStrip
        items={[
          {
            label: "Template lembaga",
            value: mine.length,
            icon: <Layers />,
            chip: "bg-role-soft text-role-strong",
          },
          {
            label: "Draft menunggu final",
            value: draft,
            icon: <FileText />,
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

      <TemplateGallery templates={templates} basePath="/admin/raport" role="ADMIN" />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Raport Santri</h2>
          <Link
            href="/admin/raport/riwayat"
            className="inline-flex items-center gap-1 text-xs font-semibold text-role-strong hover:underline"
          >
            Riwayat lengkap ({reports.length}) <ArrowRight className="size-3" />
          </Link>
        </div>
        <ReportListTable
          reports={reports.slice(0, 8)}
          canFinalize={false}
          emptyHint="Belum ada raport. Tetapkan raport utama dulu, lalu buat raport santri."
        />
      </section>
    </div>
  );
}
