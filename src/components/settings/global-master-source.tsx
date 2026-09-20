"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { addTenantSurahAction } from "@/app/actions/tahfidz-admin";
import type { ActionResult } from "@/app/actions/crud";
import { Button } from "@/components/ui/button";

type MasterSurah = { id: string; name: string };

/**
 * Rule #32 — global master data is platform-provided; tenants pick from it.
 * Master names are DB data, never hard-coded in the frontend.
 */
export function GlobalMasterSource({ usedIds }: { usedIds: string[] }) {
  const [rows, setRows] = useState<MasterSurah[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const used = new Set(usedIds);

  function load() {
    setLoading(true);
    // Read via a tiny server action so the master list never ships in the bundle.
    import("@/app/actions/tahfidz-admin").then(async ({ loadGlobalSurahsAction }) => {
      const data = await loadGlobalSurahsAction();
      setRows(data);
      setLoading(false);
    });
  }

  function add(id: string) {
    setAdding(id);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("surahId", id);
      const res: ActionResult = await addTenantSurahAction(null, fd);
      if (res.success) {
        toast.success(res.success);
        setUsed((prev) => new Set(prev).add(id));
      } else if (res.error) {
        toast.error(res.error);
      }
      setAdding(null);
    });
  }

  const [usedState, setUsed] = useState<Set<string>>(used);

  return (
    <div className="rounded-2xl border border-role/15 bg-role-soft/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">Katalog Global Juz 30</h3>
          <p className="text-muted-foreground text-xs">
            Surat bawaan platform. Tambahkan yang ingin digunakan lembaga Anda.
          </p>
        </div>
        {!rows && (
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Tampilkan Katalog
          </Button>
        )}
      </div>

      {rows && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((s) => {
            const isUsed = usedState.has(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-1.5 rounded-lg border border-role/15 bg-card px-2.5 py-1.5"
              >
                <span className="truncate text-xs font-medium text-foreground/85">{s.name}</span>
                {isUsed ? (
                  <span className="text-[0.65rem] font-semibold text-emerald-600 dark:text-emerald-300">dipakai</span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Tambah ${s.name}`}
                    onClick={() => add(s.id)}
                    disabled={adding !== null}
                    className="rounded p-0.5 text-role hover:bg-role-soft disabled:opacity-40"
                  >
                    {adding === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
