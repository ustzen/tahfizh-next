"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarDays, Info, ListChecks, Plus, Save, X } from "lucide-react";

import {
  createTugasAction,
  deleteTugasAction,
  saveTugasGridAction,
  type TugasHalaqah,
  type TugasItem,
  type TugasMode,
  type TugasScore,
} from "@/app/actions/tugas-halaqah";
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
import { fmtDMY } from "@/lib/date-format";

/**
 * TAHFIZH V12.8 — Grid Tugas (client).
 *
 * Tampilan sesuai contoh: bilah atas (Mode Nilai + tombol Tambah Tugas),
 * tabel dengan header berwarna (pink) — kolom NO, NAMA SANTRI, satu kolom per
 * tugas (judul + tanggal + tombol × untuk hapus), kolom terakhir % & NILAI.
 * Sel centang per (tugas, santri); % = tugas dikerjakan / total tugas × 100;
 * nilai huruf dihitung otomatis dari persentase (A/B/C/D).
 * Mode penilaian dapat diganti: Centang (Mengerjakan) / Huruf / Angka.
 */

type Student = { id: string; name: string; nickname: string | null; code?: string | null; halaqahIds?: string[] };
type CellState = { mode: TugasMode; scoreLabel: string | null; scoreValue: number | null };

const MODE_OPTIONS: { key: TugasMode; label: string }[] = [
  { key: "CENTANG", label: "Centang (Mengerjakan)" },
  { key: "HURUF", label: "Huruf (A/B/C/D)" },
  { key: "ANGKA", label: "Angka (0-100)" },
];

const HURUF_GRADES = ["A", "B", "C", "D"];

/** Konversi persentase pengerjaan → nilai huruf otomatis. */
function percentToGrade(pct: number): string {
  if (pct >= 86) return "A";
  if (pct >= 71) return "B";
  if (pct >= 56) return "C";
  return "D";
}

function formatDateId(iso: string): string {
  return fmtDMY(iso);
}

export function TugasGridClient({
  initialError,
  halaqah,
  tasks,
  students,
  initialScores,
}: {
  initialError: string | null;
  halaqah: TugasHalaqah[];
  tasks: TugasItem[];
  students: Student[];
  initialScores: Record<string, TugasScore>;
}) {
  const [scores, setScores] = useState<Record<string, CellState>>(() => {
    const out: Record<string, CellState> = {};
    for (const [k, v] of Object.entries(initialScores)) {
      out[k] = { mode: v.mode ?? "CENTANG", scoreLabel: v.scoreLabel, scoreValue: v.scoreValue };
    }
    return out;
  });
  const [mode, setMode] = useState<TugasMode>("CENTANG");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Form tambah tugas.
  const [fTitle, setFTitle] = useState("");
  const [fHalaqah, setFHalaqah] = useState("");
  const [fDue, setFDue] = useState("");
  const [fAssigned, setFAssigned] = useState(() => new Date().toISOString().slice(0, 10));
  const [fDesc, setFDesc] = useState("");

  const key = (tugasId: string, studentId: string) => `${tugasId}:${studentId}`;

  /** Sel dinilai = ada entry (✓ / huruf / angka). */
  const isDone = (tugasId: string, studentId: string) => {
    const c = scores[key(tugasId, studentId)];
    return !!c && (c.scoreLabel !== null || c.scoreValue !== null);
  };

  /** % pengerjaan per santri terhadap tugas halaqahnya (maks 100). */
  function percentFor(st: Student): number {
    if (tasks.length === 0) return 0;
    const stHalaqah = st.halaqahIds ?? [];
    const relevant = tasks.filter((t) => stHalaqah.includes(t.halaqahId));
    if (relevant.length === 0) return 0;
    const done = relevant.filter((t) => isDone(t.id, st.id)).length;
    return Math.round((done / relevant.length) * 100);
  }

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

  function toggleCell(tugasId: string, studentId: string) {
    const k = key(tugasId, studentId);
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
        const [tugasId, studentId] = k.split(":");
        return {
          tugasId,
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
      const res = await saveTugasGridAction(items);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${res.saved ?? items.length} nilai tugas tersimpan.`);
      }
    });
  }

  function onAddTugas() {
    startTransition(async () => {
      const res = await createTugasAction({
        title: fTitle,
        halaqahId: fHalaqah,
        dueDate: fDue,
        assignedDate: fAssigned,
        description: fDesc || null,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Tugas baru dibuat — kolom tugas muncul di grid.");
        setDialogOpen(false);
        setFTitle("");
        setFDesc("");
        setFDue("");
      }
    });
  }

  function onDeleteTugas(tugasId: string, title: string) {
    if (!window.confirm(`Hapus tugas "${title}"? Nilai yang tersimpan juga akan terhapus.`)) return;
    startTransition(async () => {
      const res = await deleteTugasAction(tugasId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Tugas dihapus.");
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

  const hasHalaqah = halaqah.length > 0;

  return (
    <div className="space-y-4">
      {/* Bilah atas: Mode Nilai + tombol Tambah Tugas */}
      <Card className="shadow-card rounded-2xl">
        <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/85">Mode Nilai:</span>
            <Select value={mode} onValueChange={(v) => setMode(v as TugasMode)}>
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
            {mode === "CENTANG" && "Centang tugas yang sudah dikerjakan santri. Nilai huruf otomatis dari persentase."}
            {mode === "HURUF" && "Isi nilai huruf A/B/C/D langsung per sel tugas."}
            {mode === "ANGKA" && "Isi nilai angka 0-100 langsung per sel tugas."}
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
              onClick={() => {
                if (!hasHalaqah) {
                  toast.error("Anda belum menjadi pengampu halaqah.");
                  return;
                }
                setFHalaqah(halaqah[0]?.id ?? "");
                setFAssigned(new Date().toISOString().slice(0, 10));
                setDialogOpen(true);
              }}
              className="bg-role text-role-ink hover:brightness-95"
            >
              <Plus className="size-4" /> Tambah Tugas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid penilaian */}
      <Card className="shadow-card overflow-hidden rounded-2xl p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-pink-600 hover:bg-transparent">
                <TableHead className="w-10 bg-pink-600 py-3.5 text-center font-bold text-white">NO</TableHead>
                <TableHead className="sticky left-10 z-10 w-16 bg-pink-600 py-3.5 text-center font-bold text-white">
                  NIS
                </TableHead>
                <TableHead className="sticky left-[6.5rem] z-10 min-w-56 bg-pink-600 py-3.5 font-bold text-white">
                  NAMA SANTRI
                </TableHead>
                {tasks.map((t) => (
                  <TableHead key={t.id} className="min-w-28 bg-pink-600 px-2 py-3.5 text-center text-white">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-start gap-1 font-bold">
                        {t.title}
                        <button
                          type="button"
                          onClick={() => onDeleteTugas(t.id, t.title)}
                          title={`Hapus tugas ${t.title}`}
                          className="rounded p-0.5 hover:bg-white/20"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                      <span className="text-[10px] font-medium text-pink-100">
                        {formatDateId(t.dueDate)}
                      </span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="min-w-28 bg-pink-600 py-3.5 text-center font-bold text-white">
                  % &amp; NILAI
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((st, i) => {
                const pct = percentFor(st);
                const grade = percentToGrade(pct);
                return (
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
                    {tasks.map((t) => {
                      const stHalaqah = st.halaqahIds ?? [];
                      const member = stHalaqah.includes(t.halaqahId);
                      const cell = scores[key(t.id, st.id)];
                      const done = isDone(t.id, st.id);
                      return (
                        <TableCell key={t.id} className="px-2 py-2 text-center">
                          {!member ? (
                            <span className="text-slate-300">—</span>
                          ) : mode === "ANGKA" && cell?.scoreValue !== null && cell?.scoreValue !== undefined ? (
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={cell.scoreValue ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? null : Number(e.target.value);
                                setScores((prev) => ({
                                  ...prev,
                                  [key(t.id, st.id)]: {
                                    mode: "ANGKA",
                                    scoreLabel: null,
                                    scoreValue: v !== null && !Number.isNaN(v) ? v : null,
                                  },
                                }));
                              }}
                              className="h-8 w-16 rounded-md border border-border bg-card text-center text-sm font-bold outline-none focus:ring-2 focus:ring-pink-300"
                            />
                          ) : mode === "HURUF" && cell?.scoreLabel && cell.scoreLabel !== "✓" ? (
                            <select
                              value={cell.scoreLabel}
                              onChange={(e) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [key(t.id, st.id)]: { mode: "HURUF", scoreLabel: e.target.value, scoreValue: null },
                                }))
                              }
                              className="h-8 w-16 rounded-md border border-border bg-card text-center text-sm font-bold outline-none focus:ring-2 focus:ring-pink-300"
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
                              onClick={() => toggleCell(t.id, st.id)}
                              title={`${t.title} — ${st.name}`}
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
                    <TableCell className="px-3 text-center">
                      <span className="mr-2 inline-flex items-center gap-1 text-sm font-bold text-foreground">
                        {pct}%
                      </span>
                      <span className="inline-flex size-6 items-center justify-center rounded-md bg-rose-100 dark:bg-rose-500/15 text-xs font-bold text-rose-600 dark:text-rose-300">
                        {grade}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={tasks.length + 3} className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada santri halaqah binaan Anda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {tasks.length === 0 && students.length > 0 && (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            Belum ada tugas. Klik <span className="font-semibold text-role-strong">Tambah Tugas</span> — tugas berlaku untuk
            semua santri di halaqah yang dipilih.
          </div>
        )}
      </Card>

      <p className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
        <CalendarDays className="size-3.5" />
        Tugas berlaku untuk seluruh santri di halaqah yang dipilih. Tanda — berarti santri bukan anggota halaqah tugas
        tersebut. Klik sel untuk menandai dikerjakan; Simpan sekali untuk semua perubahan.
      </p>

      {/* Dialog Tambah Tugas */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="size-5 text-role" /> Tambah Tugas
            </DialogTitle>
            <DialogDescription>
              Tugas ini berlaku untuk SEMUA santri di halaqah yang dipilih — nilai bisa langsung diisi di grid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="tugas-title">Judul Tugas</Label>
              <Input
                id="tugas-title"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="Contoh: Hafalan Surah An-Naba ayat 1-10"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tugas-halaqah">Halaqah</Label>
              <Select value={fHalaqah} onValueChange={setFHalaqah}>
                <SelectTrigger id="tugas-halaqah">
                  <SelectValue placeholder="Pilih halaqah" />
                </SelectTrigger>
                <SelectContent>
                  {halaqah.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tugas-assigned">Tanggal Pemberian</Label>
                <Input
                  id="tugas-assigned"
                  type="date"
                  value={fAssigned}
                  onChange={(e) => setFAssigned(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tugas-due">Tenggat Waktu</Label>
                <Input id="tugas-due" type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tugas-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="tugas-desc"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="Instruksi tugas untuk santri…"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={onAddTugas} disabled={pending || !fTitle.trim() || !fHalaqah || !fDue} className="bg-role text-role-ink hover:brightness-95">
              {pending ? <Spinner /> : <Plus className="size-4" />} Buat Tugas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
