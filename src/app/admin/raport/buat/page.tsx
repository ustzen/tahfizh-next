import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { getReportStudents } from "@/lib/report";
import { getReportPeriodDefaults } from "@/lib/akademik";
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
  const [students, period] = await Promise.all([getReportStudents(), getReportPeriodDefaults()]);
  const templateId = sp.template ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buat Raport"
        description="Pilih santri dan periode — nilai diambil otomatis dari modul pembelajaran."
      />
      {!period.hasActiveYear && (
        <div className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          Tahun ajaran belum diatur. Nilai di bawah hanya perkiraan —{" "}
          <Link href="/admin/akademik" className="font-semibold underline">
            atur Tahun Ajaran di menu Akademik
          </Link>{" "}
          agar raport otomatis mengikuti tahun ajaran dan semester aktif.
        </div>
      )}
      <NewReportForm
        templateId={templateId}
        students={students}
        defaults={{
          academicYear: sp.year ?? period.academicYear,
          semester: sp.semester ?? period.semester,
          periodStart: sp.start ?? period.periodStart,
          periodEnd: sp.end ?? period.periodEnd,
        }}
      />
    </div>
  );
}
