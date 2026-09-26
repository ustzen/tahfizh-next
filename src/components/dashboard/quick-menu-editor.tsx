"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  AudioLines,
  Award,
  BookOpenCheck,
  BookOpenText,
  CalendarCheck,
  CalendarRange,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  GripVertical,
  HandCoins,
  HandHeart,
  History,
  ListChecks,
  MessageCircleHeart,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  RotateCcw,
  Rocket,
  Settings,
  Settings2,
  SpellCheck,
  Target,
  Users,
  Users2,
} from "lucide-react";

import {
  saveDashboardQuickMenuAction,
  resetDashboardQuickMenuAction,
  type SettingsResult,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MenuIcon } from "@/components/icons/menu-icon";
import type { MenuIconOverride } from "@/lib/menu-icons";
import { cn } from "@/lib/utils";
import type { QuickMenuItem } from "@/lib/quick-menu";

/** Peta nama ikon (string) -> komponen lucide-react, sisi client (fallback). */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  ClipboardList,
  GraduationCap,
  AudioLines,
  BookOpenText,
  HandHeart,
  SpellCheck,
  ListChecks,
  NotebookPen,
  Target,
  MessagesSquare,
  MessageCircleHeart,
  Settings,
  BookOpenCheck,
  Users2,
  CalendarRange,
  FileText,
  Rocket,
  MessageSquareText,
  History,
  Activity,
  Award,
  HandCoins,
  CalendarCheck,
};

function iconFor(name: string) {
  return ICON_MAP[name] ?? Settings;
}

/**
 * V31 — Tombol kecil "Atur Menu" + dialog pengaturan Menu Cepat di dashboard.
 * Guru dapat mengubah urutan (naik/turun) dan menyembunyikan/menampilkan
 * item, tersimpan per akun (profiles.dashboard_quick_menu).
 * V39: ikon mengikuti override Pengaturan Developer (Phosphor/custom).
 */
export function QuickMenuEditorButton({
  defaults,
  visible,
  defaultVisible,
  iconOverrides = [],
}: {
  /** Semua item yang tersedia (pool lengkap), untuk ditambahkan guru. */
  defaults: QuickMenuItem[];
  /** Item yang sedang tampil, urutan sesuai preferensi tersimpan saat ini. */
  visible: QuickMenuItem[];
  /** 8 item bawaan sebelum guru mengatur apa pun (dipakai saat "Kembalikan Default"). */
  defaultVisible: QuickMenuItem[];
  /** Override ikon menu platform (V39). */
  iconOverrides?: MenuIconOverride[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetPending, startReset] = useTransition();

  // Urutan kerja: item tampil dulu (sesuai urutan tersimpan), lalu sisanya
  // yang disembunyikan menyusul di bawah (urutan default).
  const initialOrder = () => {
    const visibleKeys = new Set(visible.map((i) => i.key));
    const hidden = defaults.filter((i) => !visibleKeys.has(i.key));
    return [...visible, ...hidden];
  };

  const [items, setItems] = useState<QuickMenuItem[]>(initialOrder);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(
    () => new Set(defaults.filter((i) => !visible.some((v) => v.key === i.key)).map((i) => i.key))
  );
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function resyncFromProps() {
    setItems(initialOrder());
    setHiddenKeys(new Set(defaults.filter((i) => !visible.some((v) => v.key === i.key)).map((i) => i.key)));
    setDirty(false);
  }

  function onOpenChange(next: boolean) {
    if (next) resyncFromProps();
    setOpen(next);
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

  function toggleHidden(key: string) {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }

  function save() {
    const visibleKeysInOrder = items.filter((i) => !hiddenKeys.has(i.key)).map((i) => i.key);
    if (visibleKeysInOrder.length === 0) {
      toast.error("Pilih minimal satu menu untuk ditampilkan.");
      return;
    }
    startTransition(async () => {
      const result: SettingsResult = await saveDashboardQuickMenuAction(visibleKeysInOrder);
      if (result.success) {
        toast.success(result.success);
        setDirty(false);
        setOpen(false);
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  function reset() {
    startReset(async () => {
      const result: SettingsResult = await resetDashboardQuickMenuAction();
      if (result.success) {
        toast.success(result.success);
        const defaultVisibleKeys = new Set(defaultVisible.map((i) => i.key));
        const restHidden = defaults.filter((i) => !defaultVisibleKeys.has(i.key));
        setItems([...defaultVisible, ...restHidden]);
        setHiddenKeys(new Set(restHidden.map((i) => i.key)));
        setDirty(false);
        setOpen(false);
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="size-3.5" /> Atur Menu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atur Menu Cepat</DialogTitle>
          <DialogDescription>
            Ubah urutan dengan tombol ↑↓ atau tarik (drag), dan sembunyikan menu yang jarang Anda
            pakai. Hanya berlaku untuk akun Anda.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 py-2">
          {items.map((item, index) => {
            const hidden = hiddenKeys.has(item.key);
            return (
              <li
                key={item.key}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={onDrop}
                onDragEnd={onDrop}
                className={cn(
                  "flex cursor-grab items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm transition-shadow active:cursor-grabbing dark:bg-slate-900",
                  dragIndex === index && "opacity-60 ring-2 ring-blue-300",
                  hidden && "opacity-50"
                )}
              >
                <GripVertical className="text-muted-foreground size-4 shrink-0" />
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", item.chip)}>
                  <MenuIcon
                    menuKey={item.key}
                    overrides={iconOverrides}
                    fallback={iconFor(item.icon)}
                    className="size-4"
                  />
                </span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                <span className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Naikkan"
                    className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Turunkan"
                    className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHidden(item.key)}
                    aria-label={hidden ? `Tampilkan ${item.label}` : `Sembunyikan ${item.label}`}
                    title={hidden ? "Tampilkan" : "Sembunyikan"}
                    className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
                  >
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={reset} disabled={resetPending || pending}>
            <RotateCcw className="size-3.5" /> Kembalikan Default
          </Button>
          <Button size="sm" onClick={save} disabled={pending || resetPending || !dirty} className="bg-gradient-brand hover:opacity-90">
            <Check className="size-3.5" /> {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Grid Menu Cepat itu sendiri (link ke masing-masing modul). V39: ikon override-aware. */
export function QuickMenuGrid({
  items,
  iconOverrides = [],
}: {
  items: QuickMenuItem[];
  /** Override ikon menu platform (V39). */
  iconOverrides?: MenuIconOverride[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground mt-3 text-sm">
        Semua menu disembunyikan. Klik &quot;Atur Menu&quot; untuk menampilkan kembali.
      </p>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
      {items.map((item) => {
        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch
            className="group flex flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center transition-transform active:scale-95"
          >
            <span
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-card transition-shadow group-hover:shadow-card-lg group-active:shadow-none sm:size-16",
                item.chip
              )}
            >
              <MenuIcon
                menuKey={item.key}
                overrides={iconOverrides}
                fallback={iconFor(item.icon)}
                className="size-7 sm:size-8"
              />
            </span>
            <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-foreground sm:text-xs">
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
