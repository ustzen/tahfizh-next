"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";

import type { LearningMaterial } from "@/lib/learning";
import { LEARNING_MODULE_CONFIGS, type LearningModule } from "@/lib/learning-shared";
import {
  createLearningMaterialAction,
  deleteLearningMaterialAction,
  reorderLearningMaterialsAction,
  setLearningMaterialActiveAction,
  updateLearningMaterialAction,
} from "@/app/actions/learning-admin";
import type { ActionResult } from "@/app/actions/crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  id: string | null;
  title: string;
  subtitle: string;
  arabicText: string;
  translation: string;
  description: string;
};

/**
 * Generic admin CRUD for one module's master materials (rule #28-#29, #48):
 * hard delete only when unused; otherwise deactivate. Simple up/down reorder.
 */
export function LearningMaterialManager({
  module,
  materials: initial,
}: {
  module: LearningModule;
  materials: LearningMaterial[];
}) {
  const config = LEARNING_MODULE_CONFIGS[module];
  const [items, setItems] = useState<LearningMaterial[]>(initial);
  const [orderDirty, setOrderDirty] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const subtitleLabel =
    module === "HADITS" ? "Sumber (mis. HR. Bukhari)" : module === "DOA" ? "Latin / transliterasi" : "Kategori (mis. Nun Sukun)";

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(res.success);
        onDone?.();
        window.location.reload();
      } else if (res.error) toast.error(res.error);
    });
  }

  function submitDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    const fd = new FormData();
    fd.set("module", module);
    if (draft.id) fd.set("id", draft.id);
    fd.set("title", draft.title);
    fd.set("subtitle", draft.subtitle);
    fd.set("arabicText", draft.arabicText);
    fd.set("translation", draft.translation);
    fd.set("description", draft.description);
    run(
      () => (draft.id ? updateLearningMaterialAction(null, fd) : createLearningMaterialAction(null, fd)),
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
          <h3 className="text-sm font-bold text-foreground">Master Materi {config.label}</h3>
          <p className="text-muted-foreground text-xs">
            Materi dengan riwayat penilaian tidak dapat dihapus — nonaktifkan saja.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft({ id: null, title: "", subtitle: "", arabicText: "", translation: "", description: "" })}
        >
          <Plus className="size-4" /> Tambah Materi
        </Button>
      </div>

      {draft && (
        <form onSubmit={submitDraft} className="mb-4 space-y-2 rounded-xl border border-role/15 bg-role-soft/40 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mtitle">Judul *</Label>
              <Input
                id="mtitle"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={`Judul materi (mis. ${module === "HADITS" ? "Hadits tentang Kebersihan" : module === "DOA" ? "Doa Sebelum Belajar" : "Idzhar"})`}
                maxLength={160}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="msub">{subtitleLabel}</Label>
              <Input
                id="msub"
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                maxLength={200}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="marab">Teks Arab (opsional)</Label>
            <textarea
              id="marab"
              dir="rtl"
              rows={2}
              maxLength={2000}
              value={draft.arabicText}
              onChange={(e) => setDraft({ ...draft, arabicText: e.target.value })}
              className="border-input bg-background w-full rounded-lg border px-3 py-2 text-right text-lg leading-loose shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="النَّظَافَةُ مِنَ الإِيمَانِ"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mtrans">Terjemahan (opsional)</Label>
            <Input
              id="mtrans"
              value={draft.translation}
              onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
              maxLength={1000}
              placeholder="“Kebersihan adalah bagian dari iman.”"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mdesc">Keterangan (opsional)</Label>
            <Input
              id="mdesc"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={500}
            />
          </div>
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

      {items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Belum ada materi {config.label.toLowerCase()}.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((m, index) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="text-muted-foreground w-6 text-center font-mono text-xs">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", m.isActive ? "text-slate-800" : "text-slate-400")}>
                  {m.title}
                  {m.subtitle ? <span className="text-muted-foreground font-normal"> · {m.subtitle}</span> : null}
                </p>
                {m.description && <p className="text-muted-foreground truncate text-xs">{m.description}</p>}
              </div>

              {m.inUse && <span className="text-muted-foreground hidden text-xs sm:inline">dipakai</span>}

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Ubah"
                  onClick={() =>
                    setDraft({
                      id: m.id,
                      title: m.title,
                      subtitle: m.subtitle ?? "",
                      arabicText: m.arabicText ?? "",
                      translation: m.translation ?? "",
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
                      fd.set("module", module);
                      fd.set("isActive", String(!m.isActive));
                      return setLearningMaterialActiveAction(null, fd);
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
                        <AlertDialogTitle>Hapus materi &quot;{m.title}&quot;?</AlertDialogTitle>
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
                              fd.set("module", module);
                              return deleteLearningMaterialAction(null, fd);
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
      )}

      <div className="mt-3">
        <Button
          size="sm"
          disabled={pending || !orderDirty || items.length === 0}
          onClick={() =>
            run(() => reorderLearningMaterialsAction(module, items.map((i) => i.id)), () => setOrderDirty(false))
          }
          className="bg-gradient-brand hover:opacity-90"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Simpan Urutan
        </Button>
      </div>
    </div>
  );
}
