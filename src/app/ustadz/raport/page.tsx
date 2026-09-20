import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportTemplateGallery, getTeacherReportList } from "@/lib/report";
import { TeacherReportList } from "@/components/report/teacher-report-list";
import { TemplateGallery } from "@/components/report/template-gallery";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V13 — Guru: melihat contoh raport, menyunting template lembaga, dan
 * menetapkan raport utama; daftar raport santri halaqahnya ada di bawah.
 */
export default async function UstadzRaportPage() {
  await requireRole(["USTADZ"], "/ustadz/raport");
  const [templates, reports] = await Promise.all([
    getReportTemplateGallery(),
    getTeacherReportList(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Raport"
        description="Bentuk raport lembaga dan raport santri halaqah Anda — nilai diambil otomatis dari data pembelajaran."
      />

      <TemplateGallery templates={templates} basePath="/ustadz/raport" role="USTADZ" />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Raport Santri Halaqah</h2>
        <TeacherReportList reports={reports} />
      </div>
    </div>
  );
}
