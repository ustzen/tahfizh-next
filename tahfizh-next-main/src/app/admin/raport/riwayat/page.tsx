import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminReportList } from "@/lib/report";
import { ReportListTable } from "@/components/report/report-list-table";

export const metadata = { title: "Riwayat Raport" };

/** TAHFIZH V9 — riwayat semua raport lembaga (rule #49/#85). */
export default async function AdminRaportRiwayatPage() {
  await requireRole(["ADMIN"], "/admin/raport/riwayat");
  const reports = await getAdminReportList();

  return (
    <div className="space-y-6">
      <PageHeader title="Riwayat Raport" description="Semua raport lembaga — draft dan final." />
      <ReportListTable reports={reports} canFinalize emptyHint="Belum ada raport pada lembaga ini." />
    </div>
  );
}
