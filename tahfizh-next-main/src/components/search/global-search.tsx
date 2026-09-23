"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Loader2, Search, SearchX, GraduationCap, BookMarked, Users2, Building2 } from "lucide-react";

import { isSearchableQuery, searchGroupLabel, type SearchHit } from "@/lib/search-shared";
import { cn } from "@/lib/utils";

const TYPE_ICON = {
  SANTRI: GraduationCap,
  GURU: BookMarked,
  HALAQAH: Users2,
  LEMBAGA: Building2,
} as const;

const TYPE_TONE: Record<SearchHit["type"], string> = {
  SANTRI: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  GURU: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  HALAQAH: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  LEMBAGA: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
};

/**
 * TAHFIZH V12 — Pencarian Global (Ctrl+K / tombol 🔍).
 * Query di-debounce lalu dicari di SERVER via RPC RLS-aware — tidak ada
 * database yang diunduh ke browser. Hasil dikelompokkan per tipe dan tanpa
 * ID internal.
 */
export function GlobalSearch({
  variant = "desktop",
  onNavigate,
}: {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input saat dialog dibuka.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQuery("");
      setResults([]);
      setTouched(false);
    }
  }, [open]);

  // Debounced server-side search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!isSearchableQuery(q)) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { results?: SearchHit[] };
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setTouched(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  function go(hit: SearchHit) {
    setOpen(false);
    onNavigate?.();
    startTransition(() => {
      router.push(hit.href);
    });
  }

  const grouped = results.reduce<Record<string, SearchHit[]>>((acc, hit) => {
    (acc[hit.type] ??= []).push(hit);
    return acc;
  }, {});

  return (
    <>
      {variant === "desktop" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Pencarian global (Ctrl+K)"
          className="hidden h-9 w-56 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 transition-colors hover:border-role/40 hover:bg-white md:flex lg:w-72 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:hover:border-blue-500/40"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Cari…</span>
          <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-500 dark:border-slate-500/20 dark:bg-slate-900 dark:text-slate-400">
            Ctrl K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Pencarian global"
          className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 md:hidden dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400"
        >
          <Search className="size-4" />
          <span>Cari…</span>
        </button>
      )}

      {/* Dialog via PORTAL ke body — harus di luar <header> secara DOM.
          backdrop-filter pada header menjadikan elemen fixed di dalamnya
          terkurung ukuran header (containing block), bukan viewport. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Pencarian global">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-3 top-[8vh] mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-lg dark:border-slate-500/20 dark:bg-slate-900 sm:inset-x-6">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Search className="size-5 shrink-0 text-role" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari santri, guru, halaqah…"
                className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/80"
                aria-label="Kata kunci pencarian"
              />
              {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground/80" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup pencarian"
                className="rounded-lg border border-slate-200 px-2 py-1 text-[0.65rem] font-semibold text-slate-500 dark:border-slate-500/20"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!touched && !loading && (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 flex size-11 items-center justify-center rounded-2xl">
                    <Search className="size-5" />
                  </span>
                  <p className="text-sm font-semibold">Mulai mengetik untuk mencari</p>
                  <p className="text-muted-foreground text-xs">
                    Pencarian menyesuaikan hak akses Anda. Minimal 2 karakter.
                  </p>
                </div>
              )}

              {touched && !loading && results.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex size-11 items-center justify-center rounded-2xl">
                    <SearchX className="size-5" />
                  </span>
                  <p className="text-sm font-semibold">Tidak ada hasil untuk &quot;{query.trim()}&quot;</p>
                  <p className="text-muted-foreground text-xs">
                    Periksa ejaan atau coba kata kunci lain.
                  </p>
                </div>
              )}

              {Object.entries(grouped).map(([type, hits]) => (
                <div key={type} className="mb-2">
                  <p className="text-muted-foreground px-3 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-wider">
                    {searchGroupLabel(type as SearchHit["type"])}
                  </p>
                  <ul>
                    {hits.map((hit) => {
                      const Icon = TYPE_ICON[hit.type] ?? Search;
                      return (
                        <li key={`${hit.type}-${hit.id}`}>
                          <button
                            type="button"
                            onClick={() => go(hit)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 dark:hover:bg-slate-500/10"
                            )}
                          >
                            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TYPE_TONE[hit.type])}>
                              <Icon className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{hit.title}</span>
                              {hit.subtitle && (
                                <span className="text-muted-foreground block truncate text-xs">{hit.subtitle}</span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
