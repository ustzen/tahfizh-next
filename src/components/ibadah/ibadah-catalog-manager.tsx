"use client";

import { useState, useTransition } from "react";
import { Check, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deleteIbadahActivityAction,
  saveIbadahActivityAction,
} from "@/app/actions/ibadah";
import type { IbadahActivity } from "@/components/ibadah/ibadah-journal";

const TONE_CHIPS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
};

/**
 * TAHFIZH V51 — Kelola katalog kegiatan Jurnal Ibadah (admin/koordinator/ustadz).
 * Kegiatan bawaan platform tampil terkunci; lembaga bisa tambah/hapus miliknya.
 */
export function IbadahCatalogManager({ activities }: { activities: IbadahActivity[] }) {
  const [label, setLabel] = useState("");
  const [tone, setTone] = useState("emerald");
  const [pending, startTransition] = useTransition();

  function add() {
    const l = label.trim();
    if (l.length < 2 || l.length > 60) {
      toast.error("Nama kegiatan harus 2–60 karakter.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("label", l);
      fd.set("tone", tone);
      const res = await saveIbadahActivityAction(null, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Ditambahkan.");
      setLabel("");
    });
  }

  function remove(a: IbadahActivity) {
    if (a.isBuiltin) return;
    if (!confirm(`Hapus kegiatan "${a.label}"?`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", a.id);
      const res = await deleteIbadahActivityAction(null, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Dihapus.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="border-role/15 bg-role-soft/20 shadow-card relative overflow-hidden rounded-2xl border">
        <span
          aria-hidden
          className="bg-dots text-role/15 pointer-events-none absolute -top-4 -right-4 h-28 w-44 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
        <div className="relative flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
            <NotebookPen className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold tracking-tight">Kegiatan Jurnal Ibadah</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Daftar yang dicentang santri harian. Kegiatan bawaan tidak bisa dihapus.
            </p>
          </div>
        </div>
        <div className="relative border-t px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Kegiatan baru (mis. Qiyamul Lail, Sedekah Subuh)…"
              maxLength={60}
              className="h-10 min-w-56 flex-1 rounded-xl border px-3.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <div className="flex flex-wrap items-center gap-1">
              {Object.entries(TONE_CHIPS).map(([key, chip]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTone(key)}
                  aria-label={`Warna ${key}`}
                  aria-pressed={tone === key}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg text-xs transition-all",
                    chip,
                    tone === key ? "ring-2 ring-foreground/30 ring-offset-1" : "opacity-60 hover:opacity-100"
                  )}
                >
                  {tone === key && <Check className="size-3.5" />}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={add}
              disabled={pending}
              className="bg-role text-role-ink inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              <Plus className="size-4" />
              Tambah
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {activities.map((a) => (
          <div
            key={a.id}
            className="shadow-card flex items-center gap-3 rounded-2xl border bg-white p-3.5 dark:bg-card"
          >
            <span
              className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TONE_CHIPS[a.tone] ?? TONE_CHIPS.emerald)}
            >
              <Check className="size-4.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{a.label}</p>
            {a.isBuiltin ? (
              <span className="text-muted-foreground shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold dark:bg-slate-500/15">
                Bawaan
              </span>
            ) : (
              <button
                type="button"
                onClick={() => remove(a)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                aria-label={`Hapus ${a.label}`}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
