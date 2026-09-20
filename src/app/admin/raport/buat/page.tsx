import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportStudents } from "@/lib/report";
import { NewReportForm } from "@/components/report/new-report-form";

export const metadata = { title: "Buat Raport" };

/**
 * TAHFIZH V9 — Admin creates a report for one student from a tenant template
 * copy (rule #29/#30). Query params carry the template id + default periode
 * chosen in the template manager.
 */
export default async function AdminRaportBuatPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; year?: string; semester?: string; start?: string; end?: string }>;
}) {
  await requireRole(["ADMIN"], "/admin/raport");
  const sp = await searchParams;
  const students = await getReportStudents();
  const templateId = sp.template ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buat Raport"
        description="Pilih santri dan periode — nilai diambil otomatis dari modul pembelajaran."
      />
      <NewReportForm
        templateId={templateId}
        students={students}
        defaults={{
          academicYear: sp.year ?? "2026/2027",
          semester: sp.semester ?? "Semester 1",
          periodStart: sp.start ?? "2026-07-01",
          periodEnd: sp.end ?? "2026-12-31",
        }}
      />
    </div>
  );
}
