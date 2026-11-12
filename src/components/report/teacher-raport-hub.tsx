"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Eye, Pencil, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SAMPLE_REPORT_CTX, SAMPLE_REPORT_DATA } from "@/lib/report-shared";
import { ReportThumbnail } from "@/components/report/report-thumbnail";
import { TeacherReportList } from "@/components/report/teacher-report-list";
import type { GalleryItem } from "@/components/report/template-gallery";
import {
  duplicateReportTemplateAction,
  setReportTemplatePrimaryAction,
} from "@/app/actions/report";

const BASE_PATH = "/ustadz/raport";

type ReportItem = React.ComponentProps<typeof TeacherReportList>["reports"][number];

/**
 * TAHFIZH V88 — Halaman Raport guru (disederhanakan).
 * Dua tab: "Template Raport" (template lembaga + tiga template dasar dari
 * developer) dan "Raport Santri". Template dasar tidak diubah langsung:
 * "Pakai dan ubah" membuat salinan milik lembaga lalu membuka Report Builder.
 */
export function TeacherRaportHub({
  templates,
  reports,
}: {
  templates: GalleryItem[];
  reports: ReportItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      templates
        .filter((t) => t.scope === "TENANT")
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
    [templates]
  );
  const base = useMemo(
    () =>
      templates
        .filter((t) => t.scope === "GLOBAL" && t.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true })),
    [templates]
  );
  const primary = mine.find((t) => t.isPrimary);

  function adoptBase(t: GalleryItem) {
    setError(null);
    startTransition(async () => {
      const res = await duplicateReportTemplateAction({ templateId: t.id, newName: t.name });
      if (res.error || !res.id) {
        setError(res.error ?? "Template belum bisa disalin. Silakan coba lagi.");
        return;
      }
      router.push(`${BASE_PATH}/builder/${res.id}`);
    });
  }

  function makePrimary(t: GalleryItem) {
    setError(null);
    startTransition(async () => {
      const res = await setReportTemplatePrimaryAction({ templateId: t.id });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const thumb = (t: GalleryItem, width: number) =>
    t.layout ? (
      <ReportThumbnail
        layout={t.layout}
        ctx={SAMPLE_REPORT_CTX}
        data={SAMPLE_REPORT_DATA}
        paper={t.paper}
        orientation={t.orientation}
        width={width}
      />
    ) : (
      <div className="grid h-40 place-items-center text-xs text-muted-foreground">Tanpa pratinjau</div>
    );

  return (
    <Tabs defaultValue="template" className="gap-6">
      <TabsList>
        <TabsTrigger value="template">Template Raport</TabsTrigger>
        <TabsTrigger value="santri">
          Raport Santri{reports.length > 0 ? ` (${reports.length})` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="template" className="space-y-8" aria-busy={pending}>
        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Template lembaga</h2>
            <p className="text-xs text-muted-foreground">
              Salinan milik lembaga Anda. Raport utama dipakai saat raport santri diterbitkan.
            </p>
          </div>
          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
              <p className="text-sm font-semibold text-foreground">Belum ada template lembaga</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Pilih salah satu template dasar di bawah, ubah sesuai lembaga, lalu simpan.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mine.map((t) => (
                <article
                  key={t.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border bg-card p-3.5",
                    t.isPrimary ? "border-role/40" : "border-border"
                  )}
                >
                  <div className="flex justify-center rounded-xl bg-role-soft/60 px-4 pt-3 pb-0 [&>div]:rounded-b-none">
                    {thumb(t, 176)}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-foreground">{t.name}</p>
                    {t.isPrimary ? (
                      <Badge className="bg-role text-role-ink shrink-0 gap-1">
                        <Star className="size-3 fill-current" /> Utama
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link href={`${BASE_PATH}/builder/${t.id}`} className="grow">
                      <Button size="sm" className="w-full bg-primary text-white">
                        <Pencil className="mr-1 size-3.5" /> Ubah
                      </Button>
                    </Link>
                    <Link href={`${BASE_PATH}/contoh/${t.id}`}>
                      <Button size="sm" variant="outline" aria-label="Lihat contoh penuh">
                        <Eye className="size-3.5" />
                      </Button>
                    </Link>
                    {t.isPrimary ? (
                      <Button size="sm" variant="outline" disabled>
                        <Check className="mr-1 size-3.5" /> Utama
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => makePrimary(t)}>
                        <Star className="mr-1 size-3.5" /> Jadikan utama
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Template dasar dari pengembang</h2>
            <p className="text-xs text-muted-foreground">
              Isi utama: tartil Al-Qur’an, tahfidz Al-Qur’an, hadits pilihan, doa harian, dan presensi. Template
              dasar tidak berubah; “Pakai dan ubah” membuat salinan untuk lembaga Anda.
            </p>
          </div>
          {base.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Belum ada template dasar aktif dari pengelola sistem.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {base.map((t) => (
                <article key={t.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex justify-center rounded-xl bg-role-soft/60 px-6 pt-4 pb-0 [&>div]:rounded-b-none">
                    {thumb(t, 200)}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{t.name}</p>
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        Bawaan
                      </Badge>
                    </div>
                    {t.description ? (
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    className="mt-auto bg-primary text-white"
                    disabled={pending}
                    onClick={() => adoptBase(t)}
                  >
                    Pakai dan ubah
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      <TabsContent value="santri" className="space-y-3">
        <p className="rounded-xl bg-role-soft/60 px-4 py-2.5 text-sm text-foreground">
          Raport utama saat ini: <b>{primary?.name ?? "belum ditetapkan"}</b>. Finalisasi raport dilakukan oleh
          Admin lembaga.
        </p>
        <TeacherReportList reports={reports} />
      </TabsContent>
    </Tabs>
  );
}
