"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Info, Plus, Save, SpellCheck, X } from "lucide-react";

import {
  createTajwidMateriAction,
  deleteTajwidMateriAction,
  saveTajwidGridAction,
  type TajwidMateri,
  type TajwidMode,
} from "@/app/actions/tajwid-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
 * TAHFIZH V12.9 — Grid Tajwid (client).
 *
 * Tampilan sama dengan menu Tugas (header biru): bilah atas (Mode Nilai +
 * tombol Tambah Materi), tabel dengan kolom NO, NAMA SANTRI (menempel saat
 * scroll), satu kolom per materi (judul + tombol × hapus). Sel centang per
 * (materi, santri). Mode penilaian bisa diganti: Centang (Menguasai) /
 * Huruf / Angka — langsung dari menu.
 */

type Student = { id: string; name: string; nickname: string | null; code?: string | null };
type CellState = { mode: TajwidMode; scoreLabel: string | null; scoreValue: number | null };

const MODE_OPTIONS: { key: TajwidMode; label: string }[] = [
  { key: "CENTANG", label: "Centang (Menguasai)" },
  { key: "HURUF", label: "Huruf (A/B/C/D)" },
  { key: "ANGKA", label: "Angka (0-100)" },
];

const HURUF_GRADES = ["A", "B", "C", "D"];

export function TajwidGridClient({
  initialError,
  materi,
  students,
  initialScores,
}: {
  initialError: string | null;
  materi: TajwidMateri[];
  students: Student[];
  initialScores: Record<string, CellState>;
}) {
  const [scores, setScores] = useState<Record<string, CellState>>(initialScores);
  const [mode, setMode] = useState<TajwidMode>("CENTANG");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Form tambah materi.
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");

  const key = (materiId: string, studentId: string) => `${materiId}:${studentId}`;

  /** Sel dinilai = ada entry (✓ / huruf / angka). */
  const isDone = (materiId: string, studentId: string) => {
    const c = scores[key(materiId, studentId)];
    return !!c && (c.scoreLabel !== null || c.scoreValue !== null);
  };

  const changedKeys = useMemo(() => {
    const dirty = new Set<string>();
    for (const [k, v] of Object.entries(scores)) {
      const orig = initialScores[k];
      const origDone = !!orig && (orig.scoreLabel !== null || orig.scoreValue !== null);
      const nowDone = v.scoreLabel !== null || v.scoreValue !== null;
      if (origDone !== nowDone) dirty.add(k);
    }
    return dirty;
  }, [scores, initialScores]);

  function toggleCell(materiId: string, studentId: string) {
    const k = key(materiId, studentId);
    setScores((prev) => {
      const cur = prev[k];
      if (cur && (cur.scoreLabel !== null || cur.scoreValue !== null)) {
        // Hapus nilai (kosongkan → akan dihapus saat simpan).
        return { ...prev, [k]: { mode, scoreLabel: null, scoreValue: null } };
      }
      if (mode === "CENTANG") return { ...prev, [k]: { mode, scoreLabel: "✓", scoreValue: null } };
      if (mode === "HURUF") return { ...prev, [k]: { mode, scoreLabel: "A", scoreValue: null } };
      return { ...prev, [k]: { mode, scoreLabel: null, scoreValue: 80 } };
    });
  }

  function onSave() {
    const items = Object.entries(scores)
      .filter(([k]) => changedKeys.has(k))
      .map(([k, v]) => {
        const [materiId, studentId] = k.split(":");
        return {
          materiId,
          studentId,
          mode: v.mode,
          scoreLabel: v.scoreLabel,
          scoreValue: v.scoreValue,
        };
      });
    if (items.length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }
    startTransition(async () => {
      const res = await saveTajwidGridAction(items);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${res.saved ?? items.length} penilaian tajwid tersimpan.`);
      }
    });
  }

  function onAddMateri() {
    startTransition(async () => {
      const res = await createTajwidMateriAction({
        title: fTitle,
        description: fDesc || null,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Materi tajwid ditambahkan — kolom materi muncul di grid.");
        setDialogOpen(false);
        setFTitle("");
        setFDesc("");
      }
    });
  }

  function onDeleteMateri(materiId: string, title: string) {
    if (!window.confirm(`Hapus materi "${title}"? Penilaian yang tersimpan juga akan terhapus.`)) return;
    startTransition(async () => {
      const res = await deleteTajwidMateriAction(materiId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Materi dihapus.");
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

  return (
    <div className="space-y-4">
      {/* Bilah atas: Mode Nilai + tombol Tambah Materi */}
      <Card className="shadow-card rounded-2xl">
        <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/85">Mode Nilai:</span>
            <Select value={mode} onValueChange={(v) => setMode(v as TajwidMode)}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-snug">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {mode === "CENTANG" && "Centang materi yang sudah dikuasai santri."}
            {mode === "HURUF" && "Isi nilai huruf A/B/C/D langsung per sel materi."}
            {mode === "ANGKA" && "Isi nilai angka 0-100 langsung per sel materi."}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={onSave}
              disabled={pending || changedKeys.size === 0}
              className="bg-gradient-brand hover:opacity-90"
            >
              {pending ? <Spinner /> : <Save className="size-4" />} Simpan ({changedKeys.size})
            </Button>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="bg-role text-role-ink hover:brightness-95"
            >
              <Plus className="size-4" /> Tambah Materi
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid penilaian */}
      <Card className="shadow-card overflow-hidden rounded-2xl p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-role text-role-ink hover:bg-transparent">
                <TableHead className="w-10 bg-role text-role-ink py-3.5 text-center font-bold">NO</TableHead>
                <TableHead className="sticky left-10 z-10 w-16 bg-role text-role-ink py-3.5 text-center font-bold">
                  NIS
                </TableHead>
                <TableHead className="sticky left-[6.5rem] z-10 min-w-56 bg-role text-role-ink py-3.5 font-bold">
                  NAMA SANTRI
                </TableHead>
                {materi.map((m) => (
                  <TableHead key={m.id} className="min-w-28 bg-role text-role-ink px-2 py-3.5 text-center">
                    <span className="flex items-start justify-center gap-1 font-bold">
                      {m.title}
                      <button
                        type="button"
                        onClick={() => onDeleteMateri(m.id, m.title)}
                        title={`Hapus materi ${m.title}`}
                        className="rounded p-0.5 hover:bg-white/20"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((st, i) => (
                <TableRow key={st.id} className="hover:bg-slate-50/60">
                  <TableCell className="w-10 text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="sticky left-10 z-10 w-16 bg-white px-1 text-center text-xs font-mono text-muted-foreground">
                    {st.code ?? "—"}
                  </TableCell>
                  <TableCell className="sticky left-[6.5rem] z-10 bg-white px-4">
                    <span className="text-sm font-semibold text-foreground">{st.name}</span>
                    {st.nickname && st.nickname !== st.name && (
                      <span className="text-muted-foreground ml-2 text-xs">{st.nickname}</span>
                    )}
                  </TableCell>
                  {materi.map((m) => {
                    const cell = scores[key(m.id, st.id)];
                    const done = isDone(m.id, st.id);
                    return (
                      <TableCell key={m.id} className="px-2 py-2 text-center">
                        {mode === "ANGKA" && cell?.scoreValue !== null && cell?.scoreValue !== undefined ? (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={cell.scoreValue ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              setScores((prev) => ({
                                ...prev,
                                [key(m.id, st.id)]: {
                                  mode: "ANGKA",
                                  scoreLabel: null,
                                  scoreValue: v !== null && !Number.isNaN(v) ? v : null,
                                },
                              }));
                            }}
                            className="h-8 w-16 rounded-md border border-border bg-card text-center text-sm font-bold outline-none focus:ring-2 focus:ring-role/40"
                          />
                        ) : mode === "HURUF" && cell?.scoreLabel && cell.scoreLabel !== "✓" ? (
                          <select
                            value={cell.scoreLabel}
                            onChange={(e) =>
                              setScores((prev) => ({
                                ...prev,
                                [key(m.id, st.id)]: { mode: "HURUF", scoreLabel: e.target.value, scoreValue: null },
                              }))
                            }
                            className="h-8 w-16 rounded-md border border-border bg-card text-center text-sm font-bold outline-none focus:ring-2 focus:ring-role/40"
                          >
                            {HURUF_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleCell(m.id, st.id)}
                            title={`${m.title} — ${st.name}`}
                            className={`inline-flex h-7 w-11 items-center justify-center rounded-md border transition ${
                              done
                                ? "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600"
                                : "border-slate-300 bg-white text-slate-300 hover:border-emerald-400 hover:text-emerald-400"
                            }`}
                          >
                            {done ? "✓" : "□"}
                          </button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={materi.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada santri halaqah binaan Anda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {materi.length === 0 && students.length > 0 && (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            Belum ada materi tajwid. Klik <span className="font-semibold text-role-strong">Tambah Materi</span> — misalnya
            Mad, Dengung, Iqlab — lalu nilai penguasaan tiap santri di kolomnya.
          </div>
        )}
      </Card>

      <p className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
        <SpellCheck className="size-3.5" />
        Materi tajwid dipakai bersama satu lembaga. Klik sel untuk menandai dikuasai; Simpan sekali untuk semua
        perubahan.
      </p>

      {/* Dialog Tambah Materi */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SpellCheck className="size-5 text-role" /> Tambah Materi Tajwid
            </DialogTitle>
            <DialogDescription>
              Materi ini jadi kolom penilaian di grid — misalnya Mad, Dengung, Iqlab, Idgham.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="tajwid-title">Nama Materi</Label>
              <Input
                id="tajwid-title"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="Contoh: Mad"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tajwid-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="tajwid-desc"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="Penjelasan singkat materi untuk panduan penilaian…"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button
              onClick={onAddMateri}
              disabled={pending || !fTitle.trim()}
              className="bg-role text-role-ink hover:brightness-95"
            >
              {pending ? <Spinner /> : <Plus className="size-4" />} Tambah Materi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
