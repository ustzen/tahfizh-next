import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { getGalleryTemplate } from "@/lib/report";
import { TemplateExample } from "@/components/report/template-example";

export const metadata = { title: "Contoh Raport" };

/**
 * TAHFIZH V13 — contoh raport seukuran cetak untuk satu template.
 */
export default async function ContohRaportPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/raport");
  const { templateId } = await params;

  const template = await getGalleryTemplate(templateId);
  if (!template || !template.layout) notFound();

  return (
    <TemplateExample
      templateId={template.id}
      name={template.name}
      description={template.description}
      paper={template.paper}
      orientation={template.orientation}
      version={template.version}
      layout={template.layout}
      scope={template.scope}
      isPrimary={template.isPrimary}
      basePath="/ustadz/raport"
      isDeveloper={false}
    />
  );
}
