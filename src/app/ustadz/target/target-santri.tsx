"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import {
  clearSantriTargetAction,
  saveSantriTargetAction,
} from "@/app/actions/target-santri";
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
  type SantriTargetGroup,
  type SantriTargetRow,
  type TargetCatalogItem,
  type TargetCategory,
  type TargetScope,
  type TargetStudentOption,
} from "@/lib/target-shared";

/**
 * TAHFIZH V70 — TARGET PER SANTRI (bisa banyak santri sekaligus).
 *
 * Lapisan di atas target halaqah: baris yang disimpan menimpa target halaqah
 * untuk santri yang memilikinya. Guru memilih santri (multi-pilih + cari +
 * pilih semua), satu jenis + cakupan + isi dari katalog lembaga, lalu satu
 * target disimpan ke SEMUA santri terpilih sekaligus (satu transaksi).
 */

type DialogState = {
  category: TargetCategory;
  /** null = tambah baru; ada = ubah grup ini (santri terpilih mengikuti grup). */
  existing: SantriTargetGroup | null;
};

export function TargetSantriSection({
  binaan,
  targets,
  groups,
  catalog,
  santriLabel,
}: {
  /** Semua santri aktif di halaqah yang diampu guru. */
  binaan: TargetStudentOption[];
  targets: SantriTargetRow[];
  groups: SantriTargetGroup[];
  catalog: Record<TargetCategory, TargetCatalogItem[]>;
  santriLabel: string;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [clearing, setClearing] = useState<SantriTargetGroup | null>(null);
  const [pending, startTransition] = useTransition();

  // Form dialog.
  const [selStudentIds, setSelStudentIds] = useState<string[]>([]);
  const [fCategory, setFCategory] = useState<TargetCategory>("TAHFIDZ");
  const [fScope, setFScope] = useState<TargetScope>("TAHUN");
  const [fIds, setFIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [fDesc, setFDesc] = useState("");

  const qStudents = studentSearch.trim().toLowerCase();
  const studentsTersaring = useMemo(
    () =>
      binaan.filter(
        (b) => !qStudents || b.name.toLowerCase().includes(qStudents) || b.halaqahName.toLowerCase().includes(qStudents)
      ),
    [binaan, qStudents]
  );
  const [selAll, setSelAll] = useState(false);
  function toggleStudent(id: string) {
    setSelStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSelAll(false);
  }
  function toggleSelectAll() {
    if (selAll) {
      setSelStudentIds([]);
      setSelAll(false);
    } else {
      setSelStudentIds(studentsTersaring.map((b) => b.id));
      setSelAll(true);
    }
  }

  const qItems = itemSearch.trim().toLowerCase();
  const catalogOpsi = useMemo(
    () => catalog[fCategory] ?? [],
    [catalog, fCategory]
  );
  const opsiTersaring = qItems
    ? catalogOpsi.filter((o) => o.name.toLowerCase().includes(qItems))
    : catalogOpsi;
  function toggleItem(id: string) {
    setFIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openNewGroup() {
    setFCategory("TAHFIDZ");
    setFScope("TAHUN");
    setFIds([]);
    setFDesc("");
    setSelStudentIds([]);
    setSelAll(false);
    setStudentSearch("");
    setItemSearch("");
    setDialog({ category: "TAHFIDZ", existing: null });
  }

  function openEditGroup(group: SantriTargetGroup) {
    setFCategory(group.category);
    setFScope(group.scope);
    setFIds(group.itemIds);
    setFDesc(group.description ?? "");
    setSelStudentIds(group.studentIds);
    setSelAll(false);
    setStudentSearch("");
    setItemSearch("");
    setDialog({ category: group.category, existing: group });
  }

  const canSave =
    selStudentIds.length >= 1 && fIds.length >= 1 && fIds.length <= 500 && !pending;

  function onSave() {
    if (!dialog) return;
    startTransition(async () => {
      const res = await saveSantriTargetAction({
        studentIds: selStudentIds,
        category: fCategory,
        scope: fScope,
        itemIds: fIds,
        description: fDesc || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success);
      setDialog(null);
    });
  }

  function onClear() {
    if (!clearing) return;
    startTransition(async () => {
      const res = await clearSantriTargetAction({
        studentIds: clearing.studentIds,
        category: clearing.category,
      });
      if (res.error) toast.error(res.error);
      else toast.success("Target per santri dikosongkan.");
      setClearing(null);
    });
  }

  const dialogMeta = TARGET_CATEGORY_META[fCategory];

  return (
    <Card className="shadow-card mt-6 rounded-2xl">
      <CardContent className="px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-role-strong flex items-center gap-2 text-lg font-bold">
              <UserRound className="text-role size-5" />
              {santriLabel} Tertentu
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Target khusus {santriLabel.toLowerCase()} — menimpa target halaqahnya.
            </p>
          </div>
          <Button size="sm" variant="role" onClick={openNewGroup} disabled={pending || binaan.length === 0}>
            <Plus className="size-4" /> Beri Target ke {santriLabel}
          </Button>
        </div>

        {binaan.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Belum ada {santriLabel.toLowerCase()} di halaqah yang Anda ampu.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Belum ada target khusus — target halaqah masih berlaku untuk semua {santriLabel.toLowerCase()}.
            Klik &ldquo;Beri Target&rdquo; di atas untuk mengatur {santriLabel.toLowerCase()} tertentu (bisa banyak sekaligus).
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const meta = TARGET_CATEGORY_META[g.category];
              return (
                <div
                  key={g.key}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-card p-4 dark:border-slate-700/60 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="role">{meta.label}</Badge>
                      <span className="text-role-strong text-2xl font-bold">{g.targetValue}</span>
                      <span className="text-muted-foreground text-xs">{meta.unit}</span>
                      <Badge variant="neutral">{TARGET_SCOPE_LABEL[g.scope]}</Badge>
                    </div>
                    {g.items.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {g.items.map((it, i) => (
                          <li key={`${it}-${i}`} className="bg-role-soft/60 rounded-lg px-2 py-1 text-xs font-medium">
                            {it}
                          </li>
                        ))}
                      </ul>
                    )}
                    {g.description && (
                      <p className="text-foreground/80 mt-1.5 text-sm">{g.description}</p>
                    )}
                    <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
                      <Users className="size-3.5" />
                      {g.studentIds.length} {santriLabel.toLowerCase()}: {g.studentNames.join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditGroup(g)} disabled={pending}>
                      <Pencil className="size-3.5" /> Ubah
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 dark:text-red-300"
                      onClick={() => setClearing(g)}
                      disabled={pending}
                    >
                      <Trash2 className="size-3.5" /> Kosongkan
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground mt-3 text-[0.7rem]">
          {targets.length} baris target per {santriLabel.toLowerCase()} tersimpan — baris dengan isi sama tampil jadi satu kartu.
        </p>
      </CardContent>

      {/* Dialog: beri/ubah target untuk santri terpilih */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !pending && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="text-role size-5" />
              {dialog?.existing ? "Ubah" : "Beri"} Target per {santriLabel}
            </DialogTitle>
            <DialogDescription>
              Pilih beberapa {santriLabel.toLowerCase()} sekaligus — semua terpilih menerima target yang sama.
              Target ini menimpa target halaqahnya untuk jenis yang dipilih.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            {/* 1. Pilih santri (multi) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{santriLabel} penerima target</Label>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-role text-x hover:underline font-semibold"
                >
                  {selAll ? "Bersihkan semua" : "Pilih semua"}
                </button>
              </div>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder={`Cari nama ${santriLabel.toLowerCase()}…`}
                  className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border p-1.5">
                {studentsTersaring.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-center text-xs">Tidak ada yang cocok.</p>
                ) : (
                  studentsTersaring.map((b) => {
                    const on = selStudentIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleStudent(b.id)}
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
                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                        <span className="text-muted-foreground shrink-0 text-[0.7rem]">{b.halaqahName}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-muted-foreground text-xs">{selStudentIds.length} {santriLabel.toLowerCase()} dipilih.</p>
            </div>

            {/* 2. Jenis target */}
            <div className="space-y-1.5">
              <Label>Jenis target</Label>
              <div className="grid grid-cols-3 gap-2">
                {TARGET_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setFCategory(c);
                      setFIds([]);
                    }}
                    disabled={pending}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-center text-xs font-semibold transition",
                      fCategory === c
                        ? "border-transparent bg-role text-role-ink"
                        : "border-slate-200 bg-card hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                    )}
                  >
                    {TARGET_CATEGORY_META[c].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Cakupan */}
            <div className="space-y-1.5">
              <Label>Berlaku untuk</Label>
              <div className="grid grid-cols-3 gap-2">
                {TARGET_SCOPES.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    role="radio"
                    aria-checked={fScope === sc}
                    onClick={() => setFScope(sc)}
                    disabled={pending}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-center text-xs font-semibold transition",
                      fScope === sc
                        ? "border-transparent bg-role text-role-ink"
                        : "border-slate-200 bg-card hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                    )}
                  >
                    {TARGET_SCOPE_LABEL[sc]}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Isi dari katalog */}
            <div className="space-y-1.5">
              <Label>{dialogMeta.itemsLabel}</Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={`Cari ${dialogMeta.unit}…`}
                  className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border p-1.5">
                {opsiTersaring.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-center text-xs">
                    Katalog {dialogMeta.label} lembaga masih kosong.
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
                        <span className={cn("min-w-0 flex-1 truncate", !op.isActive && "text-muted-foreground opacity-60 line-through")}>
                          {op.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {fIds.length} {dialogMeta.unit} dipilih — jumlah target dihitung otomatis.
              </p>
            </div>

            {/* 5. Keterangan */}
            <div className="space-y-1.5">
              <Label htmlFor="ts-desc">Keterangan (opsional)</Label>
              <Textarea
                id="ts-desc"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                rows={2}
                maxLength={300}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={onSave} disabled={!canSave} className="bg-role text-role-ink hover:brightness-95">
              {pending ? <Spinner /> : <Check className="size-4" />} Terapkan ke {selStudentIds.length} {santriLabel.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi kosongkan */}
      <AlertDialog open={clearing !== null} onOpenChange={(open) => !open && !pending && setClearing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Kosongkan target {clearing ? TARGET_CATEGORY_META[clearing.category].label : ""} untuk {clearing?.studentIds.length ?? 0} {santriLabel.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Target khusus {clearing?.studentNames.join(", ")} akan dihapus — {santriLabel.toLowerCase()} tersebut kembali mengikuti target halaqah.
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
    </Card>
  );
}
