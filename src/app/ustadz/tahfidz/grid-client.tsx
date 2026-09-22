"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpenCheck, Save } from "lucide-react";

import { saveTahfidzGridAction, type GridCellInput } from "@/app/actions/tahfidz-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * TAHFIZH V12.6 — Grid penilaian tahfidz (client).
 *
 * Kolom pertama menempel (nama santri) agar tetap terbaca saat digulir
 * horizontal; baris atas = surat An-Nas → An-Naba'. Mode penilaian dipilih
 * global (Centang/Huruf/Angka), sel bisa diklik berganti status: DINILAI →
 * DIPELAJARI → BELUM. Simpan = SATU batch call (RPC tahfidz_save_grid).
 */

type Student = { id: string; name: string; nickname: string | null; code?: string | null };
type Surah = { surahId: string; name: string; sortOrder: number };
type CellState = { status: "BELUM" | "DIPELAJARI" | "DINILAI"; scoreLabel: string | null; scoreValue: number | null };
type Mode = "CENTANG" | "HURUF" | "ANGKA";

/**
 * V12.10 — Pilihan grade huruf dari konfigurasi lembaga
 * (Pengaturan → Tahfidz → Grade, divalidasi server terhadap tahfidz_grade_settings).
 * Fallback bila lembaga belum mengatur: A+ A A- B+ B B- C+ C C- D.
 */
const FALLBACK_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D"];

const MODE_TABS: { key: Mode; label: string }[] = [
  { key: "CENTANG", label: "Centang" },
  { key: "HURUF", label: "Huruf" },
  { key: "ANGKA", label: "Angka" },
];

function cellDisplay(cell: CellState | undefined, mode: Mode): string {
  if (!cell || cell.status === "BELUM") return "";
  if (cell.status === "DIPELAJARI") return "•";
  if (mode === "HURUF") return cell.scoreLabel ?? "";
  if (mode === "ANGKA") return cell.scoreValue !== null ? String(cell.scoreValue) : "";
  return "✓";
}

/**
 * V12.9 — Nama surat ditulis VERTIKAL (writing-mode vertical-rl, dibaca dari
 * bawah ke atas) di header kolom berlatar ungu. Lebar kolom jadi tetap sempit
 * sehingga seluruh 37 surat (An-Nas → An-Naba') cukup dalam satu halaman
 * tanpa perlu scroll ke kanan.
 */
function VerticalSurahName({ name }: { name: string }) {
  return (
    <span
      className="inline-block whitespace-nowrap text-[0.55rem] font-bold text-white"
      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      {name}
    </span>
  );
}

const CELL_STYLES: Record<"nilaidinilai" | "dipelajari" | "belum", string> = {
  nilaidinilai: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  dipelajari: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  belum: "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100",
};

export function TahfidzGridClient({
  initialError,
  students,
  surahs,
  grades,
  initialCells,
}: {
  initialError: string | null;
  students: Student[];
  surahs: Surah[];
  grades: string[];
  initialCells: Record<string, CellState>;
}) {
  const [cells, setCells] = useState<Record<string, CellState>>(initialCells);
  const [mode, setMode] = useState<Mode>("CENTANG");
  const [pending, startTransition] = useTransition();

  const gradeOptions = grades.length > 0 ? grades : FALLBACK_GRADES;

  const key = (surahId: string, studentId: string) => `${surahId}:${studentId}`;

  /** Jumlah surat yang sudah DINILAI untuk satu santri (dihitung dari state sel saat ini). */
  function countDinilai(studentId: string): number {
    return surahs.reduce((acc, s) => {
      const c = cells[key(s.surahId, studentId)];
      return acc + (c?.status === "DINILAI" ? 1 : 0);
    }, 0);
  }

  /**
   * Urutan baris: jumlah hafalan (DINILAI) TERBANYAK dulu; bila sama, NIS
   * LEBIH BESAR tampil lebih atas (mis. NIS 025 di atas NIS 012).
   */
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const diff = countDinilai(b.id) - countDinilai(a.id);
      if (diff !== 0) return diff;
      const an = Number(a.code ?? "");
      const bn = Number(b.code ?? "");
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return bn - an;
      return (b.code ?? "").localeCompare(a.code ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, cells, surahs]);

  const changedKeys = useMemo(() => {
    const dirty = new Set<string>();
    for (const [k, v] of Object.entries(cells)) {
      const orig = initialCells[k];
      if (!orig || orig.status !== v.status || orig.scoreLabel !== v.scoreLabel || orig.scoreValue !== v.scoreValue) {
        dirty.add(k);
      }
    }
    return dirty;
  }, [cells, initialCells]);

  function cycleCell(surahId: string, studentId: string) {
    const k = key(surahId, studentId);
    setCells((prev) => {
      const cur = prev[k] ?? { status: "BELUM" as const, scoreLabel: null, scoreValue: null };
      let next: CellState;
      if (mode === "CENTANG") {
        // V25: mode Centang hanya 2 tahap — Menguasai / Belum Menguasai (Dipelajari dihilangkan).
        next =
          cur.status === "DINILAI"
            ? { status: "BELUM", scoreLabel: null, scoreValue: null }
            : { status: "DINILAI", scoreLabel: "✓", scoreValue: null };
      } else if (cur.status === "BELUM") {
        next = { status: "DIPELAJARI", scoreLabel: null, scoreValue: null };
      } else if (cur.status === "DIPELAJARI") {
        next =
          mode === "HURUF"
            ? { status: "DINILAI", scoreLabel: gradeOptions[0], scoreValue: null }
            : { status: "DINILAI", scoreLabel: null, scoreValue: 80 };
      } else {
        next = { status: "BELUM", scoreLabel: null, scoreValue: null };
      }
      return { ...prev, [k]: next };
    });
  }

  function setCell(surahId: string, studentId: string, patch: Partial<CellState>) {
    const k = key(surahId, studentId);
    setCells((prev) => {
      const cur = prev[k] ?? { status: "BELUM" as const, scoreLabel: null, scoreValue: null };
      return { ...prev, [k]: { ...cur, ...patch, status: "DINILAI" } };
    });
  }

  function onSave() {
    const items: GridCellInput[] = [];
    for (const k of changedKeys) {
      const [surahId, studentId] = k.split(":");
      const cell = cells[k];
      if (!cell) continue;
      items.push({
        surahId,
        studentId,
        mode,
        status: cell.status,
        scoreLabel: cell.scoreLabel,
        scoreValue: cell.scoreValue,
        note: null,
      });
    }
    if (items.length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }
    startTransition(async () => {
      const res = await saveTahfidzGridAction(items);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${res.saved ?? items.length} penilaian tersimpan — sinkron dengan dasbor santri.`);
      }
    });
  }

  if (initialError) {
    return (
      <Card className="shadow-card rounded-2xl">
        <CardContent className="py-10 text-center text-sm text-red-600 dark:text-red-300">{initialError}</CardContent>
      </Card>
    );
  }

  if (surahs.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpenCheck /></EmptyMedia>
          <EmptyTitle>Belum ada surat aktif.</EmptyTitle>
          <EmptyDescription>
            Lembaga belum mengaktifkan surat tahfidz. Hubungi Admin melalui Pengaturan → Tahfidz.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (students.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpenCheck /></EmptyMedia>
          <EmptyTitle>Belum ada santri binaan.</EmptyTitle>
          <EmptyDescription>
            Santri halaqah yang Anda ampu akan muncul di sini. Pastikan admin menetapkan Anda pengampu halaqah.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs font-semibold">Mode penilaian:</span>
            {MODE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setMode(t.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  mode === t.key
                    ? "border-blue-300 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
            {mode === "HURUF" && (
              <span className="text-muted-foreground ml-2 text-xs">klik sel dua kali: BELUM → Dipelajari → {gradeOptions[0]} (ubah grade di sel)</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={onSave}
            disabled={pending || changedKeys.size === 0}
            className="bg-gradient-brand hover:opacity-90"
          >
            {pending ? <Spinner /> : <Save className="size-4" />} Simpan ({changedKeys.size})
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[calc(100vh-22rem)] min-h-[12rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20 [&_tr]:hover:bg-violet-600">
              <TableRow className="bg-violet-600">
                <TableHead className="w-8 bg-violet-600 px-1 text-center text-xs font-bold text-white">No</TableHead>
                <TableHead className="sticky left-0 z-30 w-14 bg-violet-600 px-1 text-center text-xs font-bold text-white">NIS</TableHead>
                <TableHead className="sticky left-14 z-30 min-w-32 bg-violet-600 px-2 text-xs font-bold text-white">Nama</TableHead>
                {surahs.map((s) => (
                  <TableHead
                    key={s.surahId}
                    className="w-6 min-w-6 max-w-6 border-l border-violet-400/50 px-0 pb-1.5 pt-1.5 text-center"
                    title={s.name}
                  >
                    <VerticalSurahName name={s.name} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStudents.map((st, rowIdx) => (
                <TableRow key={st.id} className="odd:bg-white even:bg-violet-50/40">
                  <TableCell className="px-1 text-center text-xs text-muted-foreground">{rowIdx + 1}</TableCell>
                  <TableCell className="sticky left-0 z-10 bg-inherit px-1 text-center font-mono text-xs text-muted-foreground">
                    {st.code ?? "—"}
                  </TableCell>
                  <TableCell className="sticky left-14 z-10 bg-inherit px-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">{st.name}</span>
                      {st.nickname && st.nickname !== st.name && (
                        <span className="text-muted-foreground text-[0.65rem]">{st.nickname}</span>
                      )}
                    </div>
                  </TableCell>
                  {surahs.map((s) => {
                    const cell = cells[key(s.surahId, st.id)];
                    const variant =
                      cell?.status === "DINILAI" ? "nilaidinilai" : cell?.status === "DIPELAJARI" ? "dipelajari" : "belum";
                    return (
                      <TableCell key={s.surahId} className="p-0.5 text-center">
                        {mode === "ANGKA" && cell?.status === "DINILAI" ? (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={cell.scoreValue ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              setCell(s.surahId, st.id, { scoreValue: v !== null && !Number.isNaN(v) ? v : null });
                            }}
                            onDoubleClick={() => cycleCell(s.surahId, st.id)}
                            className={`h-7 w-6 rounded border px-0 text-center text-[0.65rem] font-bold outline-none focus:ring-2 ${CELL_STYLES[variant]}`}
                          />
                        ) : mode === "HURUF" && cell?.status === "DINILAI" ? (
                          <select
                            value={cell.scoreLabel ?? gradeOptions[0]}
                            onChange={(e) => setCell(s.surahId, st.id, { scoreLabel: e.target.value })}
                            onDoubleClick={() => cycleCell(s.surahId, st.id)}
                            className={`h-7 w-6 rounded border text-center text-[0.55rem] font-bold outline-none focus:ring-2 ${CELL_STYLES[variant]}`}
                          >
                            {gradeOptions.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => cycleCell(s.surahId, st.id)}
                            title={`${s.name} — ${st.name}`}
                            className={`h-7 w-6 rounded border text-xs font-bold transition ${CELL_STYLES[variant]}`}
                          >
                            {cellDisplay(cell, mode)}
                          </button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 px-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15" />
            {mode === "CENTANG" ? "Menguasai" : "Dinilai"}
          </span>
          {mode !== "CENTANG" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15" /> Dipelajari
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-border bg-muted/50" />
            {mode === "CENTANG" ? "Belum Menguasai" : "Belum"}
          </span>
          <span>Klik sel: ganti status. Mode Angka/Huruf: isi nilai di sel. Simpan sekali untuk semua perubahan.</span>
        </div>
      </CardContent>
    </Card>
  );
}
