"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";

import type { TartilMaterial } from "@/lib/tartil";
import {
  createMaterialAction,
  deleteMaterialAction,
  reorderMaterialsAction,
  setMaterialActiveAction,
  updateMaterialAction,
} from "@/app/actions/tartil-admin";
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

type Draft = {
  id: string | null; // null = new
  name: string;
  jilid: string;
  pagesLabel: string;
  description: string;
};

export function MaterialManager({ materials: initial }: { materials: TartilMaterial[] }) {
  const [items, setItems] = useState<TartilMaterial[]>(initial);
  const [orderDirty, setOrderDirty] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(res.success);
        onDone?.();
        window.location.reload(); // config pages: cheap full refresh after invalidation
      } else if (res.error) toast.error(res.error);
    });
  }

  function submitDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    const fd = new FormData();
    if (draft.id) fd.set("id", draft.id);
    fd.set("name", draft.name);
    fd.set("jilid", draft.jilid);
    fd.set("pagesLabel", draft.pagesLabel);
    fd.set("description", draft.description);
    run(
      () => (draft.id ? updateMaterialAction(null, fd) : createMaterialAction(null, fd)),
      () => setDraft(null)
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
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">Master Materi Tartil</h3>
          <p className="text-muted-foreground text-xs">
            Iqra, Al-Qur&apos;an, atau materi custom lembaga Anda. Materi dengan riwayat penilaian
            tidak dapat dihapus — nonaktifkan saja.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setDraft({ id: null, name: "", jilid: "", pagesLabel: "", description: "" })
          }
        >
          <Plus className="size-4" /> Tambah Materi
        </Button>
      </div>

      {/* Add / edit form (simple form, no complex drag-drop — rule #15) */}
      {draft && (
        <form onSubmit={submitDraft} className="mb-4 space-y-2 rounded-xl border border-role/15 bg-role-soft/40 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Nama materi (mis. Iqra Jilid 4)"
              maxLength={80}
              required
            />
            <Input
              value={draft.jilid}
              onChange={(e) => setDraft({ ...draft, jilid: e.target.value })}
              placeholder="Jilid (opsional)"
              maxLength={40}
            />
            <Input
              value={draft.pagesLabel}
              onChange={(e) => setDraft({ ...draft, pagesLabel: e.target.value })}
              placeholder="Halaman default (mis. 3–4)"
              maxLength={60}
            />
          </div>
          <Input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Keterangan (opsional, mis. Bacaan huruf bersambung)"
            maxLength={300}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending} className="bg-gradient-brand hover:opacity-90">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {draft.id ? "Simpan Perubahan" : "Tambah"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              <X className="size-4" /> Batal
            </Button>
          </div>
        </form>
      )}

      <ul className="divide-y">
        {items.map((m, index) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="text-muted-foreground w-6 text-center font-mono text-xs">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", m.isActive ? "text-slate-800" : "text-slate-400")}>
                {m.name}
                {m.jilid ? <span className="text-muted-foreground font-normal"> · Jilid {m.jilid}</span> : null}
                {m.pagesLabel ? <span className="text-muted-foreground font-normal"> · Hal. {m.pagesLabel}</span> : null}
              </p>
              {m.description && (
                <p className="text-muted-foreground truncate text-xs">{m.description}</p>
              )}
            </div>

            {m.inUse && <span className="text-muted-foreground hidden text-xs sm:inline">dipakai</span>}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Ubah"
                onClick={() =>
                  setDraft({
                    id: m.id,
                    name: m.name,
                    jilid: m.jilid ?? "",
                    pagesLabel: m.pagesLabel ?? "",
                    description: m.description ?? "",
                  })
                }
                className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
              >
                <Pencil className="size-3.5" />
              </button>

              <button
                type="button"
                aria-label={m.isActive ? "Nonaktifkan" : "Aktifkan"}
                title={m.isActive ? "Nonaktifkan" : "Aktifkan"}
                onClick={() =>
                  run(() => {
                    const fd = new FormData();
                    fd.set("id", m.id);
                    fd.set("isActive", String(!m.isActive));
                    return setMaterialActiveAction(null, fd);
                  })
                }
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  m.isActive ? "text-emerald-600" : "text-slate-400"
                )}
              >
                <Power className="size-3.5" />
              </button>

              {!m.inUse && (
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
                      <AlertDialogTitle>Hapus materi &quot;{m.name}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Materi belum memiliki riwayat penilaian sehingga aman dihapus.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() =>
                          run(() => {
                            const fd = new FormData();
                            fd.set("id", m.id);
                            return deleteMaterialAction(null, fd);
                          })
                        }
                      >
                        Hapus
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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

      <div className="mt-3">
        <Button
          size="sm"
          disabled={pending || !orderDirty}
          onClick={() => run(() => reorderMaterialsAction(items.map((i) => i.id)), () => setOrderDirty(false))}
          className="bg-gradient-brand hover:opacity-90"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Simpan Urutan
        </Button>
      </div>
    </div>
  );
}
