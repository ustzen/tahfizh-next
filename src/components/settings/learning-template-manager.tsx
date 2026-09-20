"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Power } from "lucide-react";

import type { LearningNoteTemplate } from "@/lib/learning";
import {
  LEARNING_MODULE_CONFIGS,
  NOTE_SLOT_LABELS,
  type LearningModule,
} from "@/lib/learning-shared";
import {
  createLearningTemplateAction,
  reorderLearningTemplatesAction,
  setLearningTemplateActiveAction,
  updateLearningTemplateAction,
} from "@/app/actions/learning-admin";
import type { ActionResult } from "@/app/actions/crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Reusable template engine UI (rule #20) — one manager, module-scoped. */
export function LearningTemplateManager({
  module,
  templates: initial,
}: {
  module: LearningModule;
  templates: LearningNoteTemplate[];
}) {
  const config = LEARNING_MODULE_CONFIGS[module];
  const [items, setItems] = useState<LearningNoteTemplate[]>(initial);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newSlot, setNewSlot] = useState<string>(config.noteSlots[0]);
  const [newContent, setNewContent] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [pending, startTransition] = useTransition();

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
          <h3 className="text-sm font-bold text-foreground">Template Catatan {config.label}</h3>
          <p className="text-muted-foreground text-xs">
            Guru memilih template lalu menyesuaikan isinya — template asli tidak berubah.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowNew((v) => !v)}>
          <Plus className="size-4" /> Tambah Template
        </Button>
      </div>

      {showNew && (
        <form
          className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-role/15 bg-role-soft/40 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newContent.trim()) return;
            const fd = new FormData();
            fd.set("module", module);
            fd.set("slot", newSlot);
            fd.set("content", newContent.trim());
            run(
              () => createLearningTemplateAction(null, fd),
              () => {
                setNewContent("");
                setShowNew(false);
              }
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="tslot">Bagian</Label>
            <Select value={newSlot} onValueChange={setNewSlot}>
              <SelectTrigger id="tslot" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.noteSlots.map((s) => (
                  <SelectItem key={s} value={s}>
                    {NOTE_SLOT_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="tcontent">Isi Template</Label>
            <Input
              id="tcontent"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={300}
              placeholder="Isi template…"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Tambah
          </Button>
        </form>
      )}

      <ul className="divide-y">
        {items.map((t, index) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="inline-flex shrink-0 rounded-full border border-role/25 bg-role-soft px-2.5 py-0.5 text-[0.7rem] font-bold text-role-strong">
              {NOTE_SLOT_LABELS[t.slot] ?? t.slot}
            </span>

            {editingId === t.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editContent.trim()) return;
                  const fd = new FormData();
                  fd.set("id", t.id);
                  fd.set("content", editContent.trim());
                  run(() => updateLearningTemplateAction(null, fd), () => setEditingId(null));
                }}
              >
                <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} maxLength={300} autoFocus />
                <Button type="submit" size="sm" disabled={pending}>
                  <Check className="size-3.5" />
                </Button>
              </form>
            ) : (
              <p className={cn("min-w-0 flex-1 truncate text-sm", t.isActive ? "text-slate-800" : "text-slate-400 line-through")}>
                {t.content}
              </p>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {editingId !== t.id && (
                <button
                  type="button"
                  aria-label="Ubah"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditContent(t.content);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                aria-label={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                title={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                onClick={() =>
                  run(() => {
                    const fd = new FormData();
                    fd.set("id", t.id);
                    fd.set("isActive", String(!t.isActive));
                    return setLearningTemplateActiveAction(null, fd);
                  })
                }
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  t.isActive ? "text-emerald-600" : "text-slate-400"
                )}
              >
                <Power className="size-3.5" />
              </button>
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
        {items.length === 0 && (
          <li className="text-muted-foreground py-6 text-center text-sm">
            Belum ada template. Default sudah tersedia — tambahkan varian lembaga Anda bila perlu.
          </li>
        )}
      </ul>

      <div className="mt-3">
        <Button
          size="sm"
          disabled={pending || !orderDirty || items.length === 0}
          onClick={() =>
            run(() => reorderLearningTemplatesAction(module, items.map((i) => i.id)), () => setOrderDirty(false))
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
