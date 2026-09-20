"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Save, X } from "lucide-react";

import {
  createLearningMaterialAction,
  deleteLearningMaterialAction,
  saveLearningGridAction,
  type LearningGridCellInput,
} from "@/app/actions/learning-grid";
import type { LearningModule } from "@/lib/learning-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
 * TAHFIZH V12.8 — Grid penilaian Hadits & Doa Harian (client).
 *
 * Sesuai permintaan: materi/hadits/doa ada di JUDUL TABEL (header kolom),
 * nama anak ada di BARIS KIRI. Mode penilaian dipilih global
 * (Centang/Huruf/Angka) — sama seperti grid Tahfidz; sel diklik berganti
 * status: DINILAI → DIPELAJARI → BELUM. Simpan = SATU batch call
 * (RPC learning_save_grid); tiap perubahan tersimpan sebagai riwayat baru.
 */

type Student = { id: string; name: string; nickname: string | null };
type Material = { materialId: string; title: string; sortOrder: number };
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

const CELL_STYLES: Record<"nilaidinilai" | "dipelajari" | "belum", string> = {
  nilaidinilai: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  dipelajari: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  belum: "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100",
};

const HEAD_COLORS = [
  "text-sky-700",
  "text-emerald-700",
  "text-violet-700",
  "text-amber-700",
  "text-rose-700",
  "text-teal-700",
  "text-indigo-700",
  "text-orange-700",
];

export function LearningGridClient({
  module,
  moduleLabel,
  initialError,
  students,
  materials,
  grades,
  initialCells,
}: {
  module: LearningModule;
  moduleLabel: string;
  initialError: string | null;
  students: Student[];
  materials: Material[];
  grades: string[];
  initialCells: Record<string, CellState>;
}) {
  const [cells, setCells] = useState<Record<string, CellState>>(initialCells);
  const [mode, setMode] = useState<Mode>("CENTANG");
  const [pending, startTransition] = useTransition();

  // V12.10 — Tambah/hapus materi langsung dari menu.
  const [materiOpen, setMateriOpen] = useState(false);
  const [materiTitle, setMateriTitle] = useState("");

  const gradeOptions = grades.length > 0 ? grades : FALLBACK_GRADES;

  const key = (materialId: string, studentId: string) => `${materialId}:${studentId}`;

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

  function cycleCell(materialId: string, studentId: string) {
    const k = key(materialId, studentId);
    setCells((prev) => {
      const cur = prev[k] ?? { status: "BELUM" as const, scoreLabel: null, scoreValue: null };
      let next: CellState;
      if (cur.status === "BELUM") {
        next = { status: "DIPELAJARI", scoreLabel: null, scoreValue: null };
      } else if (cur.status === "DIPELAJARI") {
        next =
          mode === "CENTANG"
            ? { status: "DINILAI", scoreLabel: "✓", scoreValue: null }
            : mode === "HURUF"
              ? { status: "DINILAI", scoreLabel: gradeOptions[0], scoreValue: null }
              : { status: "DINILAI", scoreLabel: null, scoreValue: 80 };
      } else {
        next = { status: "BELUM", scoreLabel: null, scoreValue: null };
      }
      return { ...prev, [k]: next };
    });
  }

  function setCell(materialId: string, studentId: string, patch: Partial<CellState>) {
    const k = key(materialId, studentId);
    setCells((prev) => {
      const cur = prev[k] ?? { status: "BELUM" as const, scoreLabel: null, scoreValue: null };
      return { ...prev, [k]: { ...cur, ...patch, status: "DINILAI" } };
    });
  }

  function onSave() {
    const items: LearningGridCellInput[] = [];
    for (const k of changedKeys) {
      const [materialId, studentId] = k.split(":");
      const cell = cells[k];
      if (!cell) continue;
      items.push({
        materialId,
        studentId,
        mode,
        status: cell.status,
        scoreLabel: cell.scoreLabel,
        scoreValue: cell.scoreValue,
      });
    }
    if (items.length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }
    startTransition(async () => {
      const res = await saveLearningGridAction(module, items);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${res.saved ?? items.length} penilaian ${moduleLabel.toLowerCase()} tersimpan.`);
      }
    });
  }

  /** V12.10 — tambah materi: jadi kolom baru di grid (sistem seperti Tugas/Tajwid). */
  function onAddMaterial() {
    startTransition(async () => {
      const res = await createLearningMaterialAction(module, materiTitle);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Materi ${moduleLabel.toLowerCase()} ditambahkan — kolom baru muncul di grid.`);
        setMateriOpen(false);
        setMateriTitle("");
      }
    });
  }

  /** V12.10 — hapus materi dari header kolom (riwayat penilaian tetap tersimpan). */
  function onDeleteMaterial(materialId: string, title: string) {
    if (!window.confirm(`Hapus materi "${title}" dari grid? Riwayat penilaian lama tetap tersimpan.`)) return;
    startTransition(async () => {
      const res = await deleteLearningMaterialAction(module, materialId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Materi dihapus dari grid.");
      }
    });
  }

  const EmptyIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>;

  if (initialError) {
    return (
      <Card className="shadow-card rounded-2xl">
        <CardContent className="py-10 text-center text-sm text-red-600 dark:text-red-300">{initialError}</CardContent>
      </Card>
    );
  }

  if (materials.length === 0) {
    return (
      <>
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setMateriOpen(true)} className="bg-role text-role-ink hover:brightness-95">
            <Plus className="size-4" /> Tambah Materi
          </Button>
        </div>
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">{EmptyIcon}</EmptyMedia>
            <EmptyTitle>Belum ada materi {moduleLabel.toLowerCase()}.</EmptyTitle>
            <EmptyDescription>
              Klik <span className="font-semibold text-role-strong">Tambah Materi</span> untuk membuat kolom penilaian —
              lalu nilai santri yang sudah menguasai langsung di grid.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <MateriDialog
          open={materiOpen}
          onOpenChange={setMateriOpen}
          title={materiTitle}
          setTitle={setMateriTitle}
          pending={pending}
          onSubmit={onAddMaterial}
          moduleLabel={moduleLabel}
        />
      </>
    );
  }

  if (students.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">{EmptyIcon}</EmptyMedia>
          <EmptyTitle>Belum ada santri.</EmptyTitle>
          <EmptyDescription>
            Santri yang Anda ampu akan muncul di sini setelah admin menetapkan Anda pengampu halaqah.
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
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMateriOpen(true)}
              className="h-8 border-role/40 text-role-strong hover:bg-role-soft"
            >
              <Plus className="size-4" /> Tambah Materi
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={pending || changedKeys.size === 0}
              className="bg-gradient-brand hover:opacity-90"
            >
              {pending ? <Spinner /> : <Save className="size-4" />} Simpan ({changedKeys.size})
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 bg-white px-4 text-foreground/85">Nama Anak</TableHead>
                {materials.map((m, i) => (
                  <TableHead
                    key={m.materialId}
                    className="min-w-28 px-2 pb-2 pt-3 text-center"
                    title={m.title}
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      <span
                        className={`text-xs font-bold ${HEAD_COLORS[i % HEAD_COLORS.length]}`}
                      >
                        {m.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteMaterial(m.materialId, m.title)}
                        title={`Hapus materi ${m.title}`}
                        className="rounded p-0.5 text-slate-300 hover:bg-muted hover:text-rose-500"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((st) => (
                <TableRow key={st.id}>
                  <TableCell className="sticky left-0 z-10 bg-white px-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{st.name}</span>
                      {st.nickname && st.nickname !== st.name && (
                        <span className="text-muted-foreground text-xs">{st.nickname}</span>
                      )}
                    </div>
                  </TableCell>
                  {materials.map((m) => {
                    const cell = cells[key(m.materialId, st.id)];
                    const variant =
                      cell?.status === "DINILAI" ? "nilaidinilai" : cell?.status === "DIPELAJARI" ? "dipelajari" : "belum";
                    return (
                      <TableCell key={m.materialId} className="p-0.5 text-center">
                        {mode === "ANGKA" && cell?.status === "DINILAI" ? (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={cell.scoreValue ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              setCell(m.materialId, st.id, { scoreValue: v !== null && !Number.isNaN(v) ? v : null });
                            }}
                            onDoubleClick={() => cycleCell(m.materialId, st.id)}
                            className={`h-8 w-9 rounded-md border px-0 text-center text-xs font-bold outline-none focus:ring-2 ${CELL_STYLES[variant]}`}
                          />
                        ) : mode === "HURUF" && cell?.status === "DINILAI" ? (
                          <select
                            value={cell.scoreLabel ?? gradeOptions[0]}
                            onChange={(e) => setCell(m.materialId, st.id, { scoreLabel: e.target.value })}
                            onDoubleClick={() => cycleCell(m.materialId, st.id)}
                            className={`h-8 w-9 rounded-md border text-center text-[0.6rem] font-bold outline-none focus:ring-2 ${CELL_STYLES[variant]}`}
                          >
                            {gradeOptions.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => cycleCell(m.materialId, st.id)}
                            title={`${m.title} — ${st.name}`}
                            className={`h-8 w-9 rounded-md border text-sm font-bold transition ${CELL_STYLES[variant]}`}
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

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 px-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15" /> Dinilai
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15" /> Dipelajari
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-border bg-muted/50" /> Belum
          </span>
          <span>Klik sel: ganti status. Mode Angka/Huruf: isi nilai di sel. Simpan sekali untuk semua perubahan.</span>
        </div>
      </CardContent>

      <MateriDialog
        open={materiOpen}
        onOpenChange={setMateriOpen}
        title={materiTitle}
        setTitle={setMateriTitle}
        pending={pending}
        onSubmit={onAddMaterial}
        moduleLabel={moduleLabel}
      />
    </Card>
  );
}

/** V12.10 — dialog Tambah Materi (nama materi jadi kolom penilaian di grid). */
function MateriDialog({
  open,
  onOpenChange,
  title,
  setTitle,
  pending,
  onSubmit,
  moduleLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  setTitle: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
  moduleLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5 text-role" /> Tambah Materi {moduleLabel}
          </DialogTitle>
          <DialogDescription>
            Materi ini jadi kolom penilaian di grid — nilai santri yang sudah menguasai sesuai mode yang dipilih.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={moduleLabel === "Hadits" ? "Contoh: Hadits Arbain 1" : moduleLabel === "Doa" ? "Contoh: Doa Sebelum Makan" : "Contoh: Mad"}
            maxLength={160}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim() && !pending) onSubmit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={pending || !title.trim()} className="bg-role text-role-ink hover:brightness-95">
            {pending ? <Spinner /> : <Plus className="size-4" />} Tambah Materi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
