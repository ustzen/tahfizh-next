import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getDevTemplateGallery } from "@/lib/report";
import { TemplateGallery } from "@/components/report/template-gallery";

export const metadata = { title: "Template Raport" };

/**
 * TAHFIZH V72 — Developer mengelola template GLOBAL dengan galeri yang langsung
 * merender contoh raportnya. Salinan lembaga berdiri sendiri — perubahan di
 * sini tidak pernah mengubah raport yang sudah terbit. Hanya penataan visual;
 * data & aksi tidak berubah.
 */
export default async function DeveloperRaportPage() {
  await requireRole(["DEVELOPER"], "/developer/raport");
  const templates = await getDevTemplateGallery();

  return (
    <div className="space-y-7">
      <PageHeader
        title="Template Raport"
        description="Contoh raport bawaan platform — dipakai seluruh lembaga melalui salinan masing-masing."
      />
      <TemplateGallery templates={templates} basePath="/developer/raport" role="DEVELOPER" />
    </div>
  );
}
