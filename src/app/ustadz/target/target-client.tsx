"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  BookOpenText,
  CalendarDays,
  HandHeart,
  Pencil,
  Plus,
  Target as TargetIcon,
  Trash2,
  Users,
} from "lucide-react";

import {
  clearHalaqahTargetAction,
  saveHalaqahTargetAction,
} from "@/app/actions/target-halaqah";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/loading";
import {
  TARGET_CATEGORIES,
  TARGET_CATEGORY_META,
  isTargetEnded,
  type HalaqahTarget,
  type TargetCategory,
  type TargetHalaqah,
} from "@/lib/target-shared";
import { fmtDMY } from "@/lib/date-format";

/**
 * TAHFIZH V17 — Target per halaqah (client).
 *
 * Satu kartu per halaqah yang diampu; di dalamnya 3 kolom target tetap:
 * Tahfidz Al-Qur'an, Hadits, Doa. Guru mengatur (buat/ubah) atau
 * mengosongkan tiap target lewat dialog. Data selalu berasal dari props
 * (server) — halaman menyegarkan diri setelah aksi tersimpan.
 */

const CATEGORY_STYLE: Record<
  TargetCategory,
  { icon: React.ComponentType<{ className?: string }>; chip: string }
> = {
  TAHFIDZ: {
    icon: BookOpen,
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  HADITS: {
    icon: BookOpenText,
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  DOA: {
    icon: HandHeart,
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
};

/** YYYY-MM-DD dari tanggal LOKAL (toISOString memakai UTC → bisa mundur sehari). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  return { start: toIsoDate(now), end: toIsoDate(end) };
}

function formatDateId(iso: string): string {
  return fmtDMY(iso);
}

type EditState = {
  halaqah: TargetHalaqah;
  category: TargetCategory;
  existing: HalaqahTarget | null;
};

export function TargetClient({
  halaqah,
  targets,
  santriLabel,
}: {
  halaqah: TargetHalaqah[];
  targets: HalaqahTarget[];
  santriLabel: string;
}) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [clearing, setClearing] = useState<EditState | null>(null);
  const [pending, startTransition] = useTransition();

  // Form dialog.
  const [fValue, setFValue] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fDesc, setFDesc] = useState("");

  const findTarget = (halaqahId: string, category: TargetCategory) =>
    targets.find((t) => t.halaqahId === halaqahId && t.category === category) ?? null;

  function openEditor(h: TargetHalaqah, category: TargetCategory) {
    const existing = findTarget(h.id, category);
    if (existing) {
      setFValue(String(existing.targetValue));
      setFStart(existing.startDate);
      setFEnd(existing.endDate);
      setFDesc(existing.description ?? "");
    } else {
      const p = defaultPeriod();
      setFValue("");
      setFStart(p.start);
      setFEnd(p.end);
      setFDesc("");
    }
    setEditing({ halaqah: h, category, existing });
  }

  const valueNumber = Number(fValue);
  const valueValid = fValue.trim() !== "" && Number.isInteger(valueNumber) && valueNumber >= 1 && valueNumber <= 10000;
  const periodValid = !!fStart && !!fEnd && fEnd >= fStart;
  const canSave = valueValid && periodValid && !pending;

  function onSave() {
    if (!editing) return;
    const { halaqah: h, category } = editing;
    startTransition(async () => {
      const res = await saveHalaqahTargetAction({
        halaqahId: h.id,
        category,
        targetValue: valueNumber,
        startDate: fStart,
        endDate: fEnd,
        description: fDesc || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Target ${TARGET_CATEGORY_META[category].label} — ${h.name} tersimpan.`);
      setEditing(null);
    });
  }

  function onClear() {
    if (!clearing) return;
    const { halaqah: h, category } = clearing;
    startTransition(async () => {
      const res = await clearHalaqahTargetAction({ halaqahId: h.id, category });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Target ${TARGET_CATEGORY_META[category].label} — ${h.name} dikosongkan.`);
      }
      setClearing(null);
    });
  }

  if (halaqah.length === 0) {
    return (
      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-5 py-10 text-center">
          <TargetIcon className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="text-sm font-semibold">Belum ada halaqah yang Anda ampu</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Target diatur per halaqah. Minta admin menetapkan Anda sebagai pengampu halaqah,
            lalu target Tahfidz Al-Qur&apos;an, Hadits, dan Doa bisa diatur di sini.
          </p>
        </CardContent>
      </Card>
    );
  }

  const editingMeta = editing ? TARGET_CATEGORY_META[editing.category] : null;

  return (
    <div className="space-y-4">
      {halaqah.map((h) => (
        <Card key={h.id} className="shadow-card rounded-2xl">
          <CardContent className="px-5 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-role-strong truncate text-lg font-bold">{h.name}</h3>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                  <Users className="size-3.5" />
                  {h.studentCount} {santriLabel.toLowerCase()} aktif
                </p>
              </div>
              <Badge variant="role">
                {TARGET_CATEGORIES.filter((c) => findTarget(h.id, c)).length}/{TARGET_CATEGORIES.length} target diatur
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {TARGET_CATEGORIES.map((category) => {
                const meta = TARGET_CATEGORY_META[category];
                const style = CATEGORY_STYLE[category];
                const Icon = style.icon;
                const t = findTarget(h.id, category);
                const ended = t ? isTargetEnded(t.endDate) : false;

                return (
                  <div
                    key={category}
                    className="flex flex-col rounded-xl border border-slate-200/80 bg-card p-4 dark:border-slate-700/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${style.chip}`}>
                        <Icon className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">{meta.label}</p>
                    </div>

                    {t ? (
                      <div className="mt-3 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="text-role-strong text-3xl font-bold">{t.targetValue}</span>
                          <span className="text-muted-foreground text-sm">{meta.unit}</span>
                          {ended && (
                            <Badge variant="neutral" className="ml-auto">
                              Periode selesai
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                          <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            {formatDateId(t.startDate)} – {formatDateId(t.endDate)}
                          </span>
                        </p>
                        {t.description && (
                          <p className="text-foreground/80 text-sm leading-snug">{t.description}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground mt-3 flex-1 text-sm">Belum diatur.</p>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={t ? "outline" : "role"}
                        onClick={() => openEditor(h, category)}
                        disabled={pending}
                      >
                        {t ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                        {t ? "Ubah" : "Atur target"}
                      </Button>
                      {t && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 dark:text-red-300"
                          onClick={() => setClearing({ halaqah: h, category, existing: t })}
                          disabled={pending}
                        >
                          <Trash2 className="size-3.5" /> Kosongkan
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
        <TargetIcon className="size-3.5" />
        Target berlaku untuk seluruh {santriLabel.toLowerCase()} di halaqah — bukan per {santriLabel.toLowerCase()}.
        Satu halaqah punya satu target untuk tiap jenis.
      </p>

      {/* Dialog atur / ubah target */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TargetIcon className="text-role size-5" />
              {editing?.existing ? "Ubah" : "Atur"} Target {editingMeta?.label}
            </DialogTitle>
            <DialogDescription>
              {editing ? `Halaqah ${editing.halaqah.name}` : ""} — berlaku untuk semua {santriLabel.toLowerCase()} di halaqah ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="target-value">Jumlah target ({editingMeta?.unit})</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="target-value"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  step={1}
                  value={fValue}
                  onChange={(e) => setFValue(e.target.value)}
                  placeholder="Contoh: 10"
                  className="max-w-40"
                />
                <span className="text-muted-foreground text-sm">{editingMeta?.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="target-start">Tanggal mulai</Label>
                <Input id="target-start" type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target-end">Tanggal selesai</Label>
                <Input id="target-end" type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
              </div>
            </div>
            {fStart && fEnd && fEnd < fStart && (
              <p className="text-xs text-red-600 dark:text-red-300">
                Tanggal selesai tidak boleh sebelum tanggal mulai.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="target-desc">Keterangan (opsional)</Label>
              <Textarea
                id="target-desc"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder={editingMeta?.placeholder}
                rows={3}
                maxLength={300}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={onSave} disabled={!canSave} className="bg-role text-role-ink hover:brightness-95">
              {pending ? <Spinner /> : <TargetIcon className="size-4" />} Simpan Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi kosongkan target */}
      <AlertDialog open={clearing !== null} onOpenChange={(open) => !open && !pending && setClearing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Kosongkan target {clearing ? TARGET_CATEGORY_META[clearing.category].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clearing ? `Target ${TARGET_CATEGORY_META[clearing.category].label} untuk halaqah ${clearing.halaqah.name} akan dihapus. ` : ""}
              Anda bisa mengaturnya lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onClear();
              }}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700"
            >
              {pending && <Spinner />} Ya, kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
