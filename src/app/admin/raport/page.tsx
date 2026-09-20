import Link from "next/link";
import { FileCheck2, FilePlus2, FileText, Layers } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminReportList, getReportTemplateGallery } from "@/lib/report";
import { TemplateGallery } from "@/components/report/template-gallery";
import { ReportListTable } from "@/components/report/report-list-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V13 — Admin Raport.
 * Halaman langsung menampilkan CONTOH RAPORT-nya: raport utama lembaga di
 * atas, lalu galeri template lembaga & contoh bawaan. Daftar raport santri
 * menyusul di bawah.
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
    <div className="space-y-8">
      <PageHeader
        title="Raport"
        description="Pilih bentuk raport, ubah sesuai lembaga, lalu tetapkan sebagai raport utama."
        action={
          primary ? (
            <Link href={`/admin/raport/buat?template=${primary.id}`}>
              <Button size="sm" className="bg-primary text-white">
                <FilePlus2 className="mr-1 h-4 w-4" /> Buat Raport Santri
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <CardBox className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
            <Layers className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Template lembaga</p>
            <p className="text-lg font-bold text-foreground">{mine.length}</p>
          </div>
        </CardBox>
        <CardBox className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500 text-white">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="text-lg font-bold text-foreground">{draft}</p>
          </div>
        </CardBox>
        <CardBox className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Raport final</p>
            <p className="text-lg font-bold text-foreground">{final}</p>
          </div>
        </CardBox>
      </div>

      <TemplateGallery templates={templates} basePath="/admin/raport" role="ADMIN" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Raport Santri</h2>
          <Badge variant="outline" className="border-role/25 bg-role-soft text-role-strong">
            {reports.length} raport
          </Badge>
        </div>
        <ReportListTable
          reports={reports.slice(0, 8)}
          canFinalize={false}
          emptyHint="Belum ada raport. Tetapkan raport utama dulu, lalu buat raport santri."
        />
      </div>
    </div>
  );
}
