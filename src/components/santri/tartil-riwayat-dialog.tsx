"use client";

import { useMemo, useState } from "react";
import { AudioLines, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  nilaiPredikat,
  nilaiText,
  nilaiTone,
  type TartilRiwayatItem,
} from "@/lib/santri-tartil-riwayat-shared";

const PAGE_SIZE = 8;
const TZ = "Asia/Jakarta";

function tglPanjang(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}
function tglHari(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", timeZone: TZ });
}
function tglBulan(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { month: "short", timeZone: TZ });
}
function materiText(i: TartilRiwayatItem) {
  return i.materialName;
}
function halText(i: TartilRiwayatItem) {
  return i.pagesLabel ? i.pagesLabel.replace("-", "–") : "—";
}
function statusText(i: TartilRiwayatItem) {
  return i.status === "DINILAI" ? "Dinilai" : i.status === "DIPELAJARI" ? "Dipelajari" : "Belum";
}

function Ringkasan({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2.5 sm:px-4 sm:py-3 dark:border-teal-500/25 dark:bg-teal-500/10", className)}>
      <p className="text-xs text-slate-600 dark:text-slate-300">{label}</p>
      <div className="mt-0.5 text-xl font-extrabold text-teal-800 sm:text-2xl dark:text-teal-200">{children}</div>
    </div>
  );
}

/**
 * Ubin Tartil di Kartu Prestasi → klik membuka daftar nilai Tartil santri:
 * desktop = tabel (No, Tanggal, Materi, Halaman, Nilai, Status, Ustadz,
 * Catatan); mobile = kartu per penilaian. `children` = ubin yang diklik.
 */
export function TartilRiwayatDialog({
  studentName,
  halaqahName,
  items,
  children,
}: {
  studentName: string;
  halaqahName: string | null;
  items: TartilRiwayatItem[];
  children: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [materi, setMateri] = useState("");
  const [page, setPage] = useState(1);

  const materiList = useMemo(() => Array.from(new Set(items.map(materiText))), [items]);

  const filtered = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return items.filter((i) => {
      if (materi && materiText(i) !== materi) return false;
      if (!kata) return true;
      return `${materiText(i)} ${i.catatan ?? ""} ${i.teacherName ?? ""}`.toLowerCase().includes(kata);
    });
  }, [items, q, materi]);

  const jumlahHalaman = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const hal = Math.min(page, jumlahHalaman);
  const mulai = (hal - 1) * PAGE_SIZE;
  const tampil = filtered.slice(mulai, mulai + PAGE_SIZE);

  const dinilai = items.filter((i) => i.status === "DINILAI");
  const angka = dinilai.filter((i) => i.scoreValue !== null).map((i) => i.scoreValue as number);
  const rata = angka.length > 0 ? angka.reduce((a, b) => a + b, 0) / angka.length : null;
  const terakhir = dinilai[0] ?? null;
  const posisi = items[0] ?? null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Lihat riwayat nilai Tartil ${studentName}`}
          className="block w-full cursor-pointer rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {children}
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-5xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 bg-teal-600 px-4 py-4 text-white sm:gap-4 sm:px-7 sm:py-5">
          <DialogClose className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 sm:hidden" aria-label="Kembali">
            <ChevronLeft className="size-5" />
          </DialogClose>
          <AudioLines className="hidden size-9 shrink-0 sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-extrabold sm:text-[1.35rem]">Riwayat Nilai Tartil</DialogTitle>
            <DialogDescription className="truncate text-sm text-white/90">
              {studentName}
              {halaqahName ? ` · ${halaqahName}` : ""}
            </DialogDescription>
          </div>
          <DialogClose className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 sm:flex" aria-label="Tutup">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-6 py-16 text-center text-sm">Belum ada penilaian Tartil.</p>
          ) : (
            <>
              {/* Ringkasan */}
              <div className="grid grid-cols-3 gap-2 px-4 pt-4 sm:grid-cols-4 sm:gap-3.5 sm:px-7">
                <Ringkasan label="Jumlah penilaian">{dinilai.length}</Ringkasan>
                <Ringkasan label="Rata-rata nilai">
                  {rata === null ? "—" : rata.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                </Ringkasan>
                <Ringkasan label="Nilai terakhir">
                  {terakhir ? nilaiText(terakhir) : "—"}
                  {terakhir && nilaiPredikat(terakhir.scoreValue) ? (
                    <span className="ml-1.5 hidden text-xs font-medium text-slate-600 sm:inline dark:text-slate-300">
                      · {nilaiPredikat(terakhir.scoreValue)}
                    </span>
                  ) : null}
                </Ringkasan>
                <Ringkasan label="Posisi bacaan" className="col-span-3 sm:col-span-1">
                  <span className="text-base sm:text-lg">
                    {posisi ? `${materiText(posisi)}${posisi.pagesLabel ? ` · Hal. ${posisi.pagesLabel}` : ""}` : "—"}
                  </span>
                </Ringkasan>
              </div>

              {/* Filter */}
              <div className="flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:px-7">
                <label className="relative flex-1">
                  <span className="sr-only">Cari materi atau catatan</span>
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Cari materi atau catatan…"
                    className="bg-background h-11 w-full rounded-xl border pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  />
                </label>
                <label>
                  <span className="sr-only">Filter materi</span>
                  <select
                    value={materi}
                    onChange={(e) => {
                      setMateri(e.target.value);
                      setPage(1);
                    }}
                    className="bg-background h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:w-52"
                  >
                    <option value="">Semua materi</option>
                    {materiList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {filtered.length === 0 ? (
                <p className="text-muted-foreground px-6 py-12 text-center text-sm">Tidak ada penilaian yang cocok.</p>
              ) : (
                <>
                  {/* Desktop: tabel */}
                  <div className="hidden px-7 pt-3 md:block">
                    <div className="overflow-hidden rounded-2xl border">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-teal-50 text-left text-xs font-bold tracking-wide text-teal-800 dark:bg-teal-500/10 dark:text-teal-200">
                            <th className="px-3.5 py-3">No</th>
                            <th className="px-3.5 py-3">Tanggal</th>
                            <th className="px-3.5 py-3">Materi</th>
                            <th className="px-3.5 py-3">Halaman</th>
                            <th className="px-3.5 py-3">Nilai</th>
                            <th className="px-3.5 py-3">Status</th>
                            <th className="px-3.5 py-3">Ustadz</th>
                            <th className="px-3.5 py-3">Catatan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tampil.map((i, idx) => (
                            <tr key={i.id} className="even:bg-muted/40 border-t align-top">
                              <td className="tabular px-3.5 py-3">{mulai + idx + 1}</td>
                              <td className="px-3.5 py-3 whitespace-nowrap">{tglPanjang(i.assessedAt)}</td>
                              <td className="px-3.5 py-3">{materiText(i)}</td>
                              <td className="tabular px-3.5 py-3">{halText(i)}</td>
                              <td className="px-3.5 py-3">
                                <span className={cn("tabular inline-block min-w-9 rounded-full px-2.5 py-0.5 text-center text-[0.8rem] font-bold", nilaiTone(i))}>
                                  {i.status === "DINILAI" ? nilaiText(i) : "–"}
                                </span>
                              </td>
                              <td className="px-3.5 py-3">{statusText(i)}</td>
                              <td className="px-3.5 py-3">{i.teacherName ?? "—"}</td>
                              <td className="text-muted-foreground px-3.5 py-3">{i.catatan ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile: kartu */}
                  <ul className="space-y-2.5 px-4 pt-3 md:hidden">
                    {tampil.map((i) => (
                      <li key={i.id} className="bg-card flex gap-3 rounded-2xl border px-3.5 py-3">
                        <div className="w-12 shrink-0 text-center">
                          <p className="tabular text-xl font-extrabold text-teal-700 dark:text-teal-300">{tglHari(i.assessedAt)}</p>
                          <p className="text-muted-foreground text-xs">{tglBulan(i.assessedAt)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">
                            {materiText(i)}
                            {i.pagesLabel ? ` · Hal. ${halText(i)}` : ""}
                          </p>
                          {i.teacherName && <p className="text-muted-foreground text-xs">{i.teacherName}</p>}
                          {i.catatan && <p className="mt-1 text-xs">{i.catatan}</p>}
                        </div>
                        <span className={cn("tabular h-fit shrink-0 rounded-full px-2.5 py-1 text-[0.8rem] font-bold", nilaiTone(i))}>
                          {nilaiText(i)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Pagination */}
                  <div className="text-muted-foreground flex items-center justify-between gap-2 px-4 pt-3 pb-5 text-xs sm:px-7">
                    <span>
                      Menampilkan {mulai + 1}–{mulai + tampil.length} dari {filtered.length} penilaian
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={hal <= 1}
                        onClick={() => setPage(hal - 1)}
                        className="text-foreground flex h-9 items-center gap-1 rounded-xl border px-3 disabled:opacity-40"
                      >
                        <ChevronLeft className="size-4" />
                        <span className="hidden sm:inline">Sebelumnya</span>
                      </button>
                      <button
                        type="button"
                        disabled={hal >= jumlahHalaman}
                        onClick={() => setPage(hal + 1)}
                        className="flex h-9 items-center gap-1 rounded-xl bg-teal-600 px-3 text-white disabled:opacity-40"
                      >
                        <span className="hidden sm:inline">Berikutnya</span>
                        <ChevronRight className="size-4" />
                      </button>
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
