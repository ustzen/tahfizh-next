"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, RotateCcw, Search, X } from "lucide-react";

import {
  resetAllMenuIconsAction,
  resetMenuIconAction,
  saveMenuIconPhosphorAction,
  uploadMenuIconAction,
  type MenuIconResult,
} from "@/app/actions/menu-icons";
import { MenuIcon } from "@/components/icons/menu-icon";
import { getPhosphorIcon } from "@/components/icons/phosphor-icons";
import { ICONS } from "@/components/dashboard/menu-icon-fallbacks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PHOSPHOR_CATALOG_GROUPS,
  type MenuIconOverride,
  type PhosphorIconChoice,
} from "@/lib/menu-icons";

/** Satu baris menu yang bisa diatur ikonnya (data saja — komponen ikon di-resolve client-side). */
export type IconMenuRow = {
  key: string;
  label: string;
};

function fallbackFor(key: string) {
  return ICONS[key] ?? ICONS.dashboard;
}

export function MenuIconManager({
  menus,
  overrides,
}: {
  /** Pool menu lengkap platform (nav + menu cepat, sudah dedup). */
  menus: IconMenuRow[];
  overrides: MenuIconOverride[];
}) {
  const [pending, startTransition] = useTransition();
  const [resetAllPending, startResetAll] = useTransition();
  const [editing, setEditing] = useState<IconMenuRow | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menus;
    return menus.filter(
      (m) => m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)
    );
  }, [menus, query]);

  function resetOne(row: IconMenuRow) {
    startTransition(async () => {
      const result: MenuIconResult = await resetMenuIconAction(row.key);
      if (result.success) toast.success(result.success);
      else if (result.error) toast.error(result.error);
    });
  }

  function resetAll() {
    if (
      !window.confirm(
        "Kembalikan SEMUA ikon menu ke bawaan? Unggahan custom juga akan dihapus."
      )
    )
      return;
    startResetAll(async () => {
      const result: MenuIconResult = await resetAllMenuIconsAction();
      if (result.success) toast.success(result.success);
      else if (result.error) toast.error(result.error);
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu…"
            className="pl-9"
            aria-label="Cari menu"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Bersihkan pencarian"
              className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetAll}
          disabled={resetAllPending || pending}
          className="ml-auto"
        >
          <RotateCcw className="size-3.5" />
          {resetAllPending ? "Mengembalikan…" : "Semua ke Bawaan"}
        </Button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {filtered.map((row) => {
          const override = overrides.find(
            (o) => o.menuKey.toLowerCase() === row.key.toLowerCase()
          );
          return (
            <li
              key={row.key}
              className="border-border/70 flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 shadow-card dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setEditing(row)}
                aria-label={`Ganti ikon ${row.label}`}
                className="bg-role-soft text-role-strong ring-role/25 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-shadow hover:shadow-card-lg"
              >
                <MenuIcon
                  menuKey={row.key}
                  overrides={overrides}
                  fallback={fallbackFor(row.key)}
                  className="size-5.5"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                <p className="text-muted-foreground truncate font-mono text-[0.7rem]">{row.key}</p>
              </div>
              {override && (
                <Badge variant="secondary" className="shrink-0 text-[0.66rem]">
                  {override.kind === "CUSTOM" ? "Unggahan" : "Phosphor"}
                </Badge>
              )}
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                  Ganti
                </Button>
                {override && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetOne(row)}
                    disabled={pending}
                    aria-label={`Reset ikon ${row.label}`}
                    className="text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="text-muted-foreground col-span-full py-8 text-center text-sm">
            Tidak ada menu yang cocok dengan pencarian.
          </li>
        )}
      </ul>

      <IconEditorDialog row={editing} overrides={overrides} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Dialog editor: pilih Phosphor / unggah gambar                             */
/* ------------------------------------------------------------------------ */

function IconEditorDialog({
  row,
  overrides,
  onClose,
}: {
  row: IconMenuRow | null;
  overrides: MenuIconOverride[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const current = row
    ? overrides.find((o) => o.menuKey.toLowerCase() === row.key.toLowerCase())
    : null;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHOSPHOR_CATALOG_GROUPS;
    return PHOSPHOR_CATALOG_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  function choosePhosphor(choice: PhosphorIconChoice) {
    if (!row) return;
    startTransition(async () => {
      const result = await saveMenuIconPhosphorAction(row.key, choice.name);
      if (result.success) {
        toast.success(`${row.label}: ikon diperbarui ke ${choice.label}.`);
        onClose();
      } else if (result.error) toast.error(result.error);
    });
  }

  function upload(file: File) {
    if (!row) return;
    setUploading(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("menuKey", row.key);
      fd.set("file", file);
      const result = await uploadMenuIconAction(fd);
      setUploading(false);
      if (result.success) {
        toast.success(`${row.label}: ${result.success}`);
        onClose();
      } else if (result.error) toast.error(result.error);
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <span className="bg-role-soft text-role-strong flex size-9 items-center justify-center rounded-xl">
                  <MenuIcon
                    menuKey={row.key}
                    overrides={overrides}
                    fallback={fallbackFor(row.key)}
                    className="size-5"
                  />
                </span>
                Ikon: {row.label}
              </DialogTitle>
              <DialogDescription>
                Pilih ikon Phosphor, atau unggah gambar sendiri (PNG/JPG/WebP/SVG, maks 512 KB).
                Berlaku untuk seluruh web (semua lembaga).
              </DialogDescription>
            </DialogHeader>

            {/* Upload custom */}
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onPick}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={pending || uploading}
              >
                <ImagePlus className="size-4" /> {uploading ? "Mengunggah…" : "Unggah Gambar…"}
              </Button>
              {current?.kind === "CUSTOM" && (
                <span className="text-muted-foreground text-xs">Saat ini memakai unggahan.</span>
              )}
            </div>

            <div className="relative mt-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari ikon… (mis. buku, target, masjid)"
                className="pl-9"
              />
            </div>

            <div className="mt-1 max-h-[45vh] space-y-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.group}>
                  <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-bold uppercase tracking-wider">
                    {g.group}
                  </p>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                    {g.items.map((choice) => {
                      const PhosphorIcon = getPhosphorIcon(choice.name);
                      const selected =
                        current?.kind === "PHOSPHOR" && current.iconName === choice.name;
                      return (
                        <button
                          key={choice.name}
                          type="button"
                          title={choice.label}
                          aria-label={choice.label}
                          onClick={() => choosePhosphor(choice)}
                          disabled={pending || uploading}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-xl border transition-colors",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:border-primary/40 hover:bg-muted"
                          )}
                        >
                          {PhosphorIcon ? (
                            <PhosphorIcon className="size-5" />
                          ) : (
                            <span className="text-[0.6rem]">{choice.name}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Tidak ada ikon yang cocok.
                </p>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-between gap-2">
              {current ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || uploading}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await resetMenuIconAction(row.key);
                      if (result.success) {
                        toast.success(`${row.label}: ${result.success}`);
                        onClose();
                      } else if (result.error) toast.error(result.error);
                    })
                  }
                >
                  <RotateCcw className="size-3.5" /> Kembali ke Bawaan
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Tutup
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
