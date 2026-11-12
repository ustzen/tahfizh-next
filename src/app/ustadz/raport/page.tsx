import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportTemplateGallery, getTeacherReportList } from "@/lib/report";
import { TeacherRaportHub } from "@/components/report/teacher-raport-hub";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V88 — Guru: halaman raport disederhanakan menjadi dua tab
 * (Template Raport, Raport Santri). Template dasar dari developer ada tiga
 * (1, 2, 3 kolom); guru menyalin lalu mengubahnya untuk lembaganya.
 */
export default async function UstadzRaportPage() {
  await requireRole(["USTADZ"], "/ustadz/raport");
  const [templates, reports] = await Promise.all([
    getReportTemplateGallery(),
    getTeacherReportList(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport"
        description="Atur bentuk raport lembaga, lalu buka raport santri halaqah Anda."
      />
      <TeacherRaportHub templates={templates} reports={reports} />
    </div>
  );
}
