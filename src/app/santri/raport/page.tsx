import type { Metadata } from "next";
import { FileText, FileClock } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getRaportList } from "@/lib/santri-pantauan";
import { tanggalId } from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Raport" };

export default async function SantriRaportPage() {
  await requireRole(["WALI_SANTRI"], "/santri/raport");
  const raport = await getRaportList();

  return (
    <div>
      <PageHeader
        title="Raport"
        description="Raport ananda yang sudah difinalkan lembaga. Raport berstatus draft belum ditampilkan."
        icon={<FileText className="size-6" />}
      />

      {raport.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="violet"
            icon={<FileClock />}
            title="Belum ada raport final"
            description="Raport akan muncul di sini setelah guru menyusun dan lembaga memfinalkannya."
          />
        </CardBox>
      ) : (
        <CardBox>
          <ul className="divide-y">
            {raport.map((r) => (
              <li key={r.reportId} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {r.studentName} · {r.semesterLabel} · TA {r.academicYear}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {r.periodLabel ?? `${tanggalId(r.periodStart)} – ${tanggalId(r.periodEnd)}`}
                    {r.teacherName ? ` · ${r.teacherName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="success">Final</Badge>
                  <span className="text-muted-foreground text-xs">
                    {r.finalizedAt ? tanggalId(r.finalizedAt) : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs leading-relaxed">
            Cetak/berkas fisik raport diterbitkan oleh lembaga. Hubungi ustadz/ustadzah pembimbing bila
            membutuhkan salinannya.
          </p>
        </CardBox>
      )}
    </div>
  );
}
