"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Power,
} from "lucide-react";

import type { TenantSurah } from "@/lib/tahfidz";
import {
  addCustomSurahAction,
  deleteTenantSurahAction,
  renameTenantSurahAction,
  reorderTenantSurahsAction,
  resetSurahNameAction,
  setSurahActiveAction,
} from "@/app/actions/tahfidz-admin";
import type { ActionResult } from "@/app/actions/crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function SurahManager({ surahs: initial }: { surahs: TenantSurah[] }) {
  const [items, setItems] = useState<TenantSurah[]>(initial);
  const [order, setOrder] = useState<string[]>(initial.map((s) => s.id));
  const [orderDirty, setOrderDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(res.success);
        onDone?.();
        // Refresh server-rendered state (cache invalidation already revalidated paths).
        window.location.reload();
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
    setOrderDirty(true);
  }

  function saveOrder() {
    run(
      () => reorderTenantSurahsAction(items.map((i) => i.id)),
      () => setOrderDirty(false)
    );
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
    setOrderDirty(true);
  }

  return (
    <div>
      {/* Add custom surah */}
      <div className="mb-4">
        {showCustom ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!customName.trim()) return;
              run(
                () => {
                  const fd = new FormData();
                  fd.set("name", customName.trim());
                  return addCustomSurahAction(null, fd);
                },
                () => {
                  setCustomName("");
                  setShowCustom(false);
                }
              );
            }}
          >
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nama surat custom, mis. Al-Baqarah"
              maxLength={60}
              className="max-w-xs"
            />
            <Button type="submit" size="sm" className="bg-gradient-brand hover:opacity-90">
              <Plus className="size-4" /> Tambah
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustom(false)}>
              Batal
            </Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowCustom(true)}>
            <Plus className="size-4" /> Tambah Surat Custom
          </Button>
        )}
        <p className="text-muted-foreground mt-1.5 text-xs">
          Surat dari master global ditambahkan lewat bagian &quot;Katalog Global Juz 30&quot; di bawah.
        </p>
      </div>

      {/* List */}
      <ul className="space-y-2">
        {items.map((s, index) => (
          <li
            key={s.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDragEnd={() => setDragIndex(null)}
            className={cn(
              "flex cursor-grab flex-wrap items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 shadow-card sm:flex-nowrap",
              dragIndex === index && "opacity-60 ring-2 ring-blue-300",
              !s.isActive && "opacity-70"
            )}
          >
            <GripVertical className="text-muted-foreground size-4 shrink-0" />
            <span className="text-muted-foreground w-6 shrink-0 text-center font-mono text-xs">
              {index + 1}
            </span>

            {editingId === s.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editName.trim()) return;
                  run(
                    () => {
                      const fd = new FormData();
                      fd.set("id", s.id);
                      fd.set("name", editName.trim());
                      return renameTenantSurahAction(null, fd);
                    },
                    () => setEditingId(null)
                  );
                }}
              >
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  autoFocus
                  className="h-8 max-w-[220px]"
                />
                <Button type="submit" size="sm" className="h-8" disabled={pending}>
                  <Check className="size-3.5" />
                </Button>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.name}
                  {s.isCustom && (
                    <span className="border-role/25 bg-role-soft text-role-strong ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold">
                      custom
                    </span>
                  )}
                </p>
              </div>
            )}

            {s.inUse && (
              <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                dipakai
              </span>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {editingId !== s.id && (
                <button
                  type="button"
                  aria-label="Ubah nama"
                  onClick={() => {
                    setEditingId(s.id);
                    setEditName(s.name);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}

              {!s.isCustom && s.baseName !== null && s.name !== s.baseName && (
                <button
                  type="button"
                  aria-label="Kembali ke nama master"
                  onClick={() =>
                    run(() => {
                      const fd = new FormData();
                      fd.set("id", s.id);
                      return resetSurahNameAction(null, fd);
                    })
                  }
                  className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}

              <button
                type="button"
                aria-label={s.isActive ? "Nonaktifkan" : "Aktifkan"}
                onClick={() =>
                  run(() => {
                    const fd = new FormData();
                    fd.set("id", s.id);
                    fd.set("isActive", String(!s.isActive));
                    return setSurahActiveAction(null, fd);
                  })
                }
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  s.isActive ? "text-emerald-600" : "text-slate-400"
                )}
                title={s.isActive ? "Nonaktifkan" : "Aktifkan"}
              >
                <Power className="size-3.5" />
              </button>

              {!s.inUse && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label="Hapus"
                      className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Hapus surat &quot;{s.name}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Surat ini belum memiliki riwayat penilaian, sehingga aman dihapus. Tindakan
                        ini tidak dapat dibatalkan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() =>
                          run(() => {
                            const fd = new FormData();
                            fd.set("id", s.id);
                            return deleteTenantSurahAction(null, fd);
                          })
                        }
                      >
                        Hapus
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {s.inUse && (
                <span
                  className="text-muted-foreground hidden p-1.5 sm:inline"
                  title="Sudah digunakan — nonaktifkan saja"
                >
                  <Trash2 className="size-3.5 opacity-30" />
                </span>
              )}

              <span className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Naikkan"
                  className="rounded-md px-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="Turunkan"
                  className="rounded-md px-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                >
                  ↓
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          onClick={saveOrder}
          disabled={pending || !orderDirty}
          className="bg-gradient-brand hover:opacity-90"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Simpan Urutan
        </Button>
        {orderDirty && <span className="text-muted-foreground text-xs">Urutan belum disimpan.</span>}
      </div>
    </div>
  );
}
