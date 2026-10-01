import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { fmtDMY } from "@/lib/date-format";
import { getCustomModules, getCustomModuleChildLogs } from "@/lib/custom-module";
import { customModuleIconFor, customModuleToneFor } from "@/components/akademik/custom-module-shared";
import { cn } from "@/lib/utils";

export const metadata = { title: "Modul" };

/**
 * TAHFIZH V59 — Menu tersendiri satu modul kustom lembaga di dasbor santri.
 * Aktif hanya bila lembaga menyalakan opsi "Tampilkan sebagai menu tersendiri"
 * pada modulnya. Menampilkan riwayat catatan poin (dan nilai, bila modul
 * graded) seluruh anak milik akun wali ini.
 */
export default async function SantriCustomModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["WALI_SANTRI"], "/santri");
  const { id } = await params;

  const [modules, logs] = await Promise.all([
    getCustomModules(),
    getCustomModuleChildLogs(id),
  ]);
  const mod = modules.find((m) => m.id === id);
  if (!mod || !mod.showAsMenu) notFound();

  const IconC = customModuleIconFor(mod.icon);
  const tone = customModuleToneFor(mod.tone);

  const totalPoin = logs.length;
  const graded = logs.filter((l) => l.scoreValue != null);
  const avg =
    graded.length > 0
      ? Math.round(graded.reduce((s, l) => s + (l.scoreValue ?? 0), 0) / graded.length)
      : null;

  return (
    <div className="space-y-4">
      <Link
        href="/santri"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold"
      >
        <ArrowLeft className="size-3.5" /> Kembali ke Dashboard
      </Link>

      {/* Header modul */}
      <div className="shadow-card overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-slate-500/20 dark:bg-card">
        <span aria-hidden className={cn("block h-1.5 w-full", tone.bar)} />
        <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
          <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", tone.tile)}>
            <IconC className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">{mod.label}</h1>
            <p className="text-muted-foreground text-[0.7rem] font-semibold">
              {mod.poinTarget > 0 ? `Target ${mod.poinTarget} poin` : "Tanpa target poin"}
              {mod.graded ? " · modul dinilai" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-slate-100 px-3.5 py-2 text-center dark:border-slate-500/20">
              <p className="text-base font-extrabold leading-none">{totalPoin}</p>
              <p className="text-muted-foreground mt-0.5 text-[0.6rem] font-semibold">Poin</p>
            </div>
            {avg != null && (
              <div className="rounded-xl border border-slate-100 px-3.5 py-2 text-center dark:border-slate-500/20">
                <p className="text-base font-extrabold leading-none">{avg}</p>
                <p className="text-muted-foreground mt-0.5 text-[0.6rem] font-semibold">Rata Nilai</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Riwayat catatan */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <p className="mb-3 text-sm font-bold">
          Riwayat Kegiatan <span className="text-muted-foreground font-normal">({logs.length})</span>
        </p>
        {logs.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Belum ada catatan untuk modul ini. Ustadz/ustadzah akan mencatat kemajuan ananda di sini.
          </p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-500/20"
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
                  <CalendarDays className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{log.studentName}</p>
                  <p className="text-muted-foreground truncate text-[0.65rem] font-semibold">
                    {fmtDMY(log.logDate)}
                    {log.note ? ` · ${log.note}` : ""}
                  </p>
                </div>
                {log.scoreValue != null && (
                  <span className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-extrabold", tone.chip)}>
                    {log.scoreValue}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
