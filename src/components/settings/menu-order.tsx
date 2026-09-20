"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { GripVertical, RotateCcw, Check } from "lucide-react";

import { saveMenuOrderAction, resetMenuOrderAction, type SettingsResult } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavEntry } from "@/lib/terminology";

/**
 * Per-user menu ordering (rule #22-#23). Lightweight HTML5 drag-and-drop —
 * no extra library. Order is saved only for the current user.
 */
export function MenuOrderEditor({
  defaultItems,
  savedOrder,
}: {
  defaultItems: NavEntry[];
  savedOrder: string[] | null;
}) {
  const [items, setItems] = useState<NavEntry[]>(() => {
    if (!savedOrder || savedOrder.length === 0) return defaultItems;
    const byKey = new Map<string, NavEntry>(defaultItems.map((i) => [i.key as string, i]));
    const ordered = savedOrder.map((k) => byKey.get(k)).filter(Boolean) as NavEntry[];
    for (const i of defaultItems) if (!ordered.some((o) => o.key === i.key)) ordered.push(i);
    return ordered;
  });
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetPending, startReset] = useTransition();

  // Notify save-state toasts from server results.
  useEffect(() => {
    // handled in transitions below
  }, []);

  function onDragStart(index: number) {
    setDragIndex(index);
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
    setDirty(true);
  }

  function onDrop() {
    setDragIndex(null);
  }

  function move(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      const result: SettingsResult = await saveMenuOrderAction(items.map((i) => i.key));
      if (result.success) {
        toast.success(result.success);
        setDirty(false);
      } else if (result.error) toast.error(result.error);
    });
  }

  function reset() {
    startReset(async () => {
      const result: SettingsResult = await resetMenuOrderAction();
      if (result.success) {
        toast.success(result.success);
        setItems(defaultItems);
        setDirty(false);
      } else if (result.error) toast.error(result.error);
    });
  }

  return (
    <div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={onDrop}
            onDragEnd={onDrop}
            className={cn(
              "flex cursor-grab items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-card transition-shadow active:cursor-grabbing",
              dragIndex === index && "opacity-60 ring-2 ring-blue-300"
            )}
          >
            <GripVertical className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
            <span className="text-muted-foreground font-mono text-xs">{item.href}</span>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Naikkan"
                className="rounded-md px-1.5 py-0.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label="Turunkan"
                className="rounded-md px-1.5 py-0.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending || !dirty} className="bg-gradient-brand hover:opacity-90">
          {pending ? <Check className="size-4 animate-pulse" /> : <Check className="size-4" />}
          Simpan Urutan
        </Button>
        <Button variant="outline" onClick={reset} disabled={resetPending}>
          <RotateCcw className="size-4" /> Kembalikan ke Urutan Default
        </Button>
        {!dirty && !pending && (
          <span className="text-muted-foreground text-xs">Tidak ada perubahan.</span>
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        Urutan hanya berlaku untuk akun Anda. Mengubah urutan tidak mengubah hak akses maupun
        pengaturan pengguna lain.
      </p>
    </div>
  );
}
