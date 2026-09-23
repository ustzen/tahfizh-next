"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Check, Pencil, Printer, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SAMPLE_REPORT_CTX, SAMPLE_REPORT_DATA } from "@/lib/report-shared";
import type { ReportLayout } from "@/lib/report-shared";
import { ReportCanvas } from "@/components/report/report-canvas";
import {
  duplicateReportTemplateAction,
  setReportTemplatePrimaryAction,
} from "@/app/actions/report";

/**
 * TAHFIZH V13 — halaman "Lihat Contoh": raport dirender seukuran cetak dengan
 * data contoh, plus tombol untuk langsung menjadikannya raport utama lembaga.
 */
export function TemplateExample({
  templateId,
  name,
  description,
  paper,
  orientation,
  version,
  layout,
  scope,
  isPrimary,
  basePath,
  isDeveloper,
}: {
  templateId: string;
  name: string;
  description: string | null;
  paper: string;
  orientation: string;
  version: number;
  layout: ReportLayout;
  scope: "TENANT" | "GLOBAL";
  isPrimary: boolean;
  basePath: string;
  isDeveloper: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const isCatalog = scope === "GLOBAL" && !isDeveloper;

  function run(fn: () => Promise<{ error?: string; success?: string; id?: string }>, goBuilder = false) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.error) {
          setMessage({ kind: "err", text: res.error });
          return;
        }
        setMessage({ kind: "ok", text: res.success ?? "Berhasil." });
        if (goBuilder && res.id) {
          router.push(`${basePath}/builder/${res.id}`);
          return;
        }
        router.refresh();
      } catch {
        setMessage({ kind: "err", text: "Perubahan belum tersimpan. Silakan coba lagi." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={basePath}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Kembali ke Raport
          </Button>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Cetak / PDF
          </Button>
          {isCatalog ? (
            <Button
              size="sm"
              className="bg-primary text-white"
              disabled={pending}
              onClick={() =>
                run(() => duplicateReportTemplateAction({ templateId, newName: name }), true)
              }
            >
              <Pencil className="mr-1 h-4 w-4" /> Pakai & Ubah
            </Button>
          ) : (
            <>
              <Link href={`${basePath}/builder/${templateId}`}>
                <Button size="sm" variant="outline">
                  <Pencil className="mr-1 h-4 w-4" /> Ubah Template
                </Button>
              </Link>
              {isPrimary ? (
                <Button size="sm" variant="outline" disabled>
                  <Check className="mr-1 h-4 w-4" /> Sudah jadi raport utama
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-primary text-white"
                  disabled={pending}
                  onClick={() => run(() => setReportTemplatePrimaryAction({ templateId }))}
                >
                  <Star className="mr-1 h-4 w-4" />
                  {isDeveloper ? "Jadikan Contoh Utama" : "Jadikan Raport Utama"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="no-print space-y-2 rounded-2xl border border-role/15 bg-role-soft/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-bold text-foreground">{name}</p>
          {isPrimary ? <Badge className="bg-role text-role-ink">Raport Utama</Badge> : null}
          <Badge variant="outline" className="text-muted-foreground">
            {paper} • {orientation === "LANDSCAPE" ? "Landscape" : "Portrait"} • v{version}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {scope === "GLOBAL" ? "Contoh bawaan" : "Milik lembaga"}
          </Badge>
        </div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Nama, nilai, dan presensi di bawah hanyalah data contoh. Raport asli mengambil data santri
          pada periode yang dipilih.
        </p>
      </div>

      {message ? (
        <p
          className={cn(
            "no-print rounded-xl px-4 py-2.5 text-sm",
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="report-print-root flex flex-col items-center gap-6 overflow-x-auto bg-slate-100 p-4 sm:p-6 dark:bg-slate-900/40">
        <ReportCanvas
          layout={layout}
          ctx={SAMPLE_REPORT_CTX}
          data={SAMPLE_REPORT_DATA}
          logoUrl={null}
          watermarkUrl={null}
          paper={paper}
          orientation={orientation}
        />
      </div>
    </div>
  );
}
