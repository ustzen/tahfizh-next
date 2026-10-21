import { PageHeader, SectionTitle } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getReportTemplateGallery, getTeacherReportList } from "@/lib/report";
import { TeacherReportList } from "@/components/report/teacher-report-list";
import { TemplateGallery } from "@/components/report/template-gallery";
import { BookUser } from "lucide-react";

export const metadata = { title: "Raport" };

/**
 * TAHFIZH V72 — Guru (rombak total): melihat contoh raport, menyunting
 * template lembaga, dan menetapkan raport utama; daftar raport santri
 * halaqahnya ada di bawah. Hanya penataan ulang visual.
 */
export default async function UstadzRaportPage() {
  await requireRole(["USTADZ"], "/ustadz/raport");
  const [templates, reports] = await Promise.all([
    getReportTemplateGallery(),
    getTeacherReportList(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Raport"
        description="Bentuk raport lembaga dan raport santri halaqah Anda — nilai diambil otomatis dari data pembelajaran."
      />

      <TemplateGallery templates={templates} basePath="/ustadz/raport" role="USTADZ" />

      <section className="space-y-3">
        <SectionTitle
          icon={<BookUser />}
          title="Raport Santri Halaqah"
          description="Klik “Lihat Raport” untuk membuka tampilan cetak; finalisasi oleh Admin lembaga."
        />
        <TeacherReportList reports={reports} />
      </section>
    </div>
  );
}
