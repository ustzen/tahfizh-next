"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  BookOpenText,
  Check,
  HandHeart,
  Pencil,
  Plus,
  Search,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/loading";
import { cn } from "@/lib/utils";
import {
  TARGET_CATEGORIES,
  TARGET_CATEGORY_META,
  TARGET_SCOPES,
  TARGET_SCOPE_LABEL,
  type HalaqahTarget,
  type TargetCatalogItem,
  type TargetCategory,
  type TargetHalaqah,
  type TargetScope,
} from "@/lib/target-shared";

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

type EditState = {
  halaqah: TargetHalaqah;
  category: TargetCategory;
  existing: HalaqahTarget | null;
};

export function TargetClient({
  halaqah,
  targets,
  catalog,
  santriLabel,
}: {
  halaqah: TargetHalaqah[];
  targets: HalaqahTarget[];
  /** Katalog lembaga per jenis — guru memilih dari sini (V54). */
  catalog: Record<TargetCategory, TargetCatalogItem[]>;
  santriLabel: string;
}) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [clearing, setClearing] = useState<EditState | null>(null);
  const [pending, startTransition] = useTransition();

  // Form dialog.
  const [fScope, setFScope] = useState<TargetScope>("TAHUN");
  const [fIds, setFIds] = useState<string[]>([]);
  const [fSearch, setFSearch] = useState("");
  const [fDesc, setFDesc] = useState("");

  const findTarget = (halaqahId: string, category: TargetCategory) =>
    targets.find((t) => t.halaqahId === halaqahId && t.category === category) ?? null;

  function openEditor(h: TargetHalaqah, category: TargetCategory) {
    const existing = findTarget(h.id, category);
    if (existing) {
      setFScope(existing.scope);
      setFIds(existing.itemIds);
      setFDesc(existing.description ?? "");
    } else {
      setFScope("TAHUN");
      setFIds([]);
      setFDesc("");
    }
    setFSearch("");
    setEditing({ halaqah: h, category, existing });
  }

  function toggleItem(id: string) {
    setFIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const catalogOpsi = editing ? (catalog[editing.category] ?? []) : [];
  const q = fSearch.trim().toLowerCase();
  const opsiTersaring = q ? catalogOpsi.filter((o) => o.name.toLowerCase().includes(q)) : catalogOpsi;
  const canSave = fIds.length >= 1 && fIds.length <= 500 && !pending;

  function onSave() {
    if (!editing) return;
    const { halaqah: h, category } = editing;
    startTransition(async () => {
      const res = await saveHalaqahTargetAction({
        halaqahId: h.id,
        category,
        scope: fScope,
        itemIds: fIds,
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
                          <Badge variant="neutral" className="ml-auto">
                            {TARGET_SCOPE_LABEL[t.scope]}
                          </Badge>
                        </div>
                        {t.items.length > 0 && (
                          <ul className="flex flex-wrap gap-1.5">
                            {t.items.map((it, i) => (
                              <li
                                key={`${it}-${i}`}
                                className={`rounded-lg px-2 py-1 text-xs font-medium ${style.chip}`}
                              >
                                {it}
                              </li>
                            ))}
                          </ul>
                        )}
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
        Satu halaqah punya satu target untuk tiap jenis, berlaku untuk 1 tahun ajaran, semester ganjil, atau semester genap.
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
              <Label>Berlaku untuk</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cakupan target">
                {TARGET_SCOPES.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    role="radio"
                    aria-checked={fScope === sc}
                    onClick={() => setFScope(sc)}
                    disabled={pending}
                    className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold transition ${
                      fScope === sc
                        ? "border-transparent bg-role text-role-ink"
                        : "border-slate-200 bg-card hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {TARGET_SCOPE_LABEL[sc]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{editingMeta?.itemsLabel}</Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  value={fSearch}
                  onChange={(e) => setFSearch(e.target.value)}
                  placeholder={`Cari ${editingMeta?.unit ?? "item"}…`}
                  className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border p-1.5">
                {opsiTersaring.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-center text-xs">
                    {catalogOpsi.length === 0
                      ? `Katalog ${editingMeta?.label ?? ""} lembaga masih kosong — minta admin/koordinator menambahkannya di menu ${editingMeta?.label ?? ""}.`
                      : "Tidak ada yang cocok dengan pencarian."}
                  </p>
                ) : (
                  opsiTersaring.map((op) => {
                    const on = fIds.includes(op.id);
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => toggleItem(op.id)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          on ? "bg-role-soft/60 font-semibold" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border",
                            on ? "bg-role border-role text-role-ink" : "border-slate-300 dark:border-slate-600"
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{op.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {fIds.length} {editingMeta?.unit} dipilih — jumlah target dihitung otomatis dari pilihan.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target-desc">Keterangan (opsional)</Label>
              <Textarea
                id="target-desc"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                rows={2}
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
