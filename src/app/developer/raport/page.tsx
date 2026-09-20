import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getDevTemplateGallery } from "@/lib/report";
import { TemplateGallery } from "@/components/report/template-gallery";

export const metadata = { title: "Template Raport" };

/**
 * TAHFIZH V13 — Developer mengelola template GLOBAL (rule #4) dengan galeri
 * yang langsung merender contoh raportnya. Salinan lembaga (rule #5) berdiri
 * sendiri — perubahan di sini tidak pernah mengubah raport yang sudah terbit.
 */
export default async function DeveloperRaportPage() {
  await requireRole(["DEVELOPER"], "/developer/raport");
  const templates = await getDevTemplateGallery();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Template Raport"
        description="Contoh raport bawaan platform — dipakai seluruh lembaga melalui salinan masing-masing."
      />
      <TemplateGallery templates={templates} basePath="/developer/raport" role="DEVELOPER" />
    </div>
  );
}
