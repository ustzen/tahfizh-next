"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, Settings, Settings2 } from "lucide-react";

import {
  saveBottomNavMenuAction,
  resetBottomNavMenuAction,
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
import { ICONS } from "@/components/dashboard/sidebar-nav";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_MAX_ITEMS, type NavEntry } from "@/lib/terminology-shared";

function iconFor(key: string) {
  return ICONS[key] ?? Settings;
}

/**
 * V32 — Bar navigasi bawah, HANYA tampil di mobile (< lg). Menampilkan
 * maksimal 4 menu pilihan pengguna (lihat resolveBottomNav). Menu penuh
 * tetap dapat diakses lewat tombol hamburger di header (drawer sidebar).
 */
export function BottomNav({ items }: { items: NavEntry[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Menu bawah"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = iconFor(item.key);
          const active =
            pathname === item.href ||
            (item.href !== "/" &&
              !/^\/(admin|koordinator|ustadz|wali|santri|developer)$/.test(item.href) &&
              pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.66rem] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Icon className={cn("size-5.5", active && "text-primary")} />
              <span className="line-clamp-1 w-full text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Dialog "Atur Menu Bawah" — pilih maks 4 item dari seluruh menu yang
 * tersedia untuk role ini, lalu atur urutannya. Tersimpan per akun
 * (profiles.bottom_nav_menu). Dipanggil dari drawer menu mobile (header).
 */
export function BottomNavEditorButton({
  allItems,
  selected,
  defaultKeys,
}: {
  /** Seluruh menu yang tersedia untuk role ini (pool lengkap). */
  allItems: NavEntry[];
  /** Item yang sedang tampil di Menu Bawah saat ini, urutan sesuai preferensi. */
  selected: NavEntry[];
  /** Kunci default sebelum pengguna mengatur apa pun (untuk "Kembalikan Default"). */
  defaultKeys: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [chosen, setChosen] = useState<string[]>(() => selected.map((i) => i.key as string));
  const [dirty, setDirty] = useState(false);

  function resync() {
    setChosen(selected.map((i) => i.key as string));
    setDirty(false);
  }

  function onOpenChange(next: boolean) {
    if (next) resync();
    setOpen(next);
  }

  function toggle(key: string) {
    setChosen((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= BOTTOM_NAV_MAX_ITEMS) {
        toast.error(`Maksimal ${BOTTOM_NAV_MAX_ITEMS} menu untuk Menu Bawah.`);
        return prev;
      }
      return [...prev, key];
    });
    setDirty(true);
  }

  function move(key: string, direction: -1 | 1) {
    setChosen((prev) => {
      const index = prev.indexOf(key);
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function save() {
    if (chosen.length === 0) {
      toast.error("Pilih minimal satu menu untuk Menu Bawah.");
      return;
    }
    startTransition(async () => {
      const result: SettingsResult = await saveBottomNavMenuAction(chosen);
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
      const result: SettingsResult = await resetBottomNavMenuAction();
      if (result.success) {
        toast.success(result.success);
        setChosen(defaultKeys);
        setDirty(false);
        setOpen(false);
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  const byKey = new Map(allItems.map((i) => [i.key as string, i]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full gap-1.5">
          <Settings2 className="size-3.5" /> Atur Menu Bawah
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atur Menu Bawah</DialogTitle>
          <DialogDescription>
            Pilih maksimal {BOTTOM_NAV_MAX_ITEMS} menu yang tampil di bar bawah layar (mobile).
            Menu lain tetap bisa dibuka lewat tombol menu di pojok kiri atas.
          </DialogDescription>
        </DialogHeader>

        {/* Menu terpilih + urutannya */}
        {chosen.length > 0 && (
          <ul className="space-y-1.5 pt-2">
            {chosen.map((key, index) => {
              const item = byKey.get(key);
              if (!item) return null;
              const Icon = iconFor(item.key);
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm dark:bg-slate-900"
                >
                  <span className="bg-role-soft flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(key, -1)}
                      disabled={index === 0}
                      aria-label="Naikkan"
                      className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(key, 1)}
                      disabled={index === chosen.length - 1}
                      aria-label="Turunkan"
                      className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-label={`Hapus ${item.label} dari Menu Bawah`}
                      className="rounded-md px-1.5 py-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground/85"
                    >
                      <Check className="size-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pool menu lain yang bisa ditambahkan */}
        <p className="text-muted-foreground mt-3 mb-1 text-[0.7rem] font-semibold uppercase tracking-wide">
          Menu lainnya
        </p>
        <div className="flex flex-wrap gap-1.5 pb-2">
          {allItems
            .filter((i) => !chosen.includes(i.key as string))
            .map((item) => {
              const Icon = iconFor(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggle(item.key as string)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="size-3.5" /> {item.label}
                </button>
              );
            })}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={reset} disabled={resetPending || pending}>
            <RotateCcw className="size-3.5" /> Kembalikan Default
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={pending || resetPending || !dirty}
            className="bg-gradient-brand hover:opacity-90"
          >
            <Check className="size-3.5" /> {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
