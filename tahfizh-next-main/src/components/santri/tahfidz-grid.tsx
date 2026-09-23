import { BookOpenCheck } from "lucide-react";

import { CardBox } from "@/components/dashboard/section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * TAHFIZH V12.6 — Blok "Hafalan Tahfidz" di dasbor santri.
 *
 * SINKRON dengan penilaian guru: membaca tabel tahfidz_assessments yang sama
 * lewat RPC `tahfidz_santri_grid` (baris = surat aktif An-Nas → An-Naba',
 * kolom = anak yang terhubung akun, sel = nilai). Read-only — penilaian hanya
 * dilakukan guru di menu Tahfidz.
 */

export type SantriGridCell = { status: string; scoreLabel: string | null; scoreValue: number | null };

function cellDisplay(c: SantriGridCell | undefined): string {
  if (!c || c.status === "BELUM") return "";
  if (c.status === "DIPELAJARI") return "•";
  if (c.scoreLabel) return c.scoreLabel;
  if (c.scoreValue !== null && c.scoreValue !== undefined) return String(c.scoreValue);
  return "✓";
}

/**
 * V12.9 — Nama surat VERTIKAL (writing-mode vertical-rl) di header ungu agar
 * lebar kolom tetap sempit dan seluruh 37 surat cukup dalam satu halaman
 * tanpa scroll kanan — paritas dengan menu Tahfidz guru.
 */
function VerticalSurahName({ name }: { name: string }) {
  return (
    <span
      className="inline-block whitespace-nowrap text-[0.65rem] font-bold text-white"
      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      {name}
    </span>
  );
}

const CELL_STYLES: Record<"dinilai" | "dipelajari", string> = {
  dinilai: "bg-emerald-50 text-emerald-800 border-emerald-200",
  dipelajari: "bg-amber-50 text-amber-700 border-amber-200",
};

export function SantriTahfidzGrid({
  children,
  surahs,
  cells,
}: {
  children: { id: string; name: string; kelas?: string | null }[];
  surahs: { surahId: string; name: string; sortOrder: number }[];
  cells: Record<string, SantriGridCell>;
}) {
  if (surahs.length === 0 || children.length === 0) return null;

  return (
    <CardBox className="mt-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <BookOpenCheck className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold text-foreground">Hafalan Tahfidz</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Penilaian hafalan per surat dari guru pembina — otomatis sinkron setiap guru menyimpan penilaian.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader className="sticky top-0 z-20 [&_tr]:hover:bg-violet-600">
            <TableRow className="bg-violet-600">
              <TableHead className="w-10 bg-violet-600 px-2 text-center text-xs font-bold text-white">No</TableHead>
              <TableHead className="sticky left-0 z-30 min-w-40 bg-violet-600 px-3 text-xs font-bold text-white">Nama</TableHead>
              <TableHead className="w-14 bg-violet-600 px-2 text-center text-xs font-bold text-white">Kelas</TableHead>
              <TableHead className="w-12 bg-violet-600 px-1 text-center text-xs font-bold text-white">Jml</TableHead>
              {surahs.map((s) => (
                <TableHead
                  key={s.surahId}
                  className="w-8 min-w-8 max-w-8 border-l border-violet-400/50 px-1 pb-2 pt-2 text-center"
                  title={s.name}
                >
                  <VerticalSurahName name={s.name} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {children.map((ch, rowIdx) => (
              <TableRow key={ch.id} className="odd:bg-white even:bg-violet-50/40">
                <TableCell className="px-2 text-center text-xs text-muted-foreground">{rowIdx + 1}</TableCell>
                <TableCell className="sticky left-0 z-10 bg-inherit px-3 text-sm font-medium text-foreground">{ch.name}</TableCell>
                <TableCell className="px-2 text-center text-xs text-muted-foreground">{ch.kelas ?? "—"}</TableCell>
                <TableCell className="px-1 text-center text-xs font-bold text-violet-700 dark:text-violet-300">
                  {surahs.reduce((acc, s) => {
                    const c = cells[`${s.surahId}:${ch.id}`];
                    return acc + (c?.status === "DINILAI" ? 1 : 0);
                  }, 0)}
                </TableCell>
                {surahs.map((s) => {
                  const cell = cells[`${s.surahId}:${ch.id}`];
                  if (!cell || cell.status === "BELUM") {
                    return (
                      <TableCell key={s.surahId} className="p-0.5 text-center">
                        <span className="inline-flex h-8 w-9 items-center justify-center rounded-md border border-border bg-muted/50 text-xs text-slate-300">
                          —
                        </span>
                      </TableCell>
                    );
                  }
                  const variant = cell.status === "DINILAI" ? "dinilai" : "dipelajari";
                  return (
                    <TableCell key={s.surahId} className="p-0.5 text-center">
                      <span
                        className={`inline-flex h-8 w-9 items-center justify-center rounded-md border text-sm font-bold ${CELL_STYLES[variant]}`}
                      >
                        {cellDisplay(cell)}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15" /> Sudah dinilai
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15" /> Sedang dipelajari
        </span>
      </div>
    </CardBox>
  );
}
