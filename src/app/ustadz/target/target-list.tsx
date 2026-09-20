"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Target as TargetIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  TARGET_MODULES,
  TARGET_MODULE_LABELS,
  targetPercent,
  targetStatusLabel,
  targetStatusStyle,
  type TargetModule,
} from "@/lib/v7-shared";
import type { TargetRow } from "@/lib/v7";
import { cn } from "@/lib/utils";

const FILTERS = ["AKTIF", "TERCAPAI", "TERLAMBAT", "SEMUA"] as const;
type Filter = (typeof FILTERS)[number];

export function TargetListClient({
  targets,
  santriLabel,
}: {
  targets: TargetRow[];
  santriLabel: string;
}) {
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return targets.filter((t) => {
      if (filter === "AKTIF" && !["BELUM_MULAI", "BERJALAN", "TERLAMBAT"].includes(t.status)) return false;
      if (filter === "TERCAPAI" && t.status !== "TERCAPAI") return false;
      if (filter === "TERLAMBAT" && t.status !== "TERLAMBAT") return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.studentName.toLowerCase().includes(q) &&
          !t.studentCode.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [targets, filter, query]);

  return (
    <div className="space-y-4">
      {/* Rule #35/#37: filters + search by santri name/ID/target title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "SEMUA", l: "Semua" },
              { v: "AKTIF", l: "Aktif" },
              { v: "TERCAPAI", l: "Tercapai" },
              { v: "TERLAMBAT", l: "Terlambat" },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                filter === f.v
                  ? "border-blue-600 bg-blue-600 text-white shadow-card"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Cari judul, ${santriLabel.toLowerCase()}, atau ID…`}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-role-soft text-role">
              <TargetIcon className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Belum ada target.</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Buat target pertama melalui halaman detail {santriLabel.toLowerCase()} atau langsung dari menu Target.
            </p>
            <Button asChild size="sm" className="mt-1">
              <Link href="/ustadz/santri">Pilih {santriLabel}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const pct = targetPercent(t.currentValue, t.targetValue);
            return (
              <Link key={t.id} href={`/ustadz/target/${t.id}`} className="group block">
                <Card
                  className={cn(
                    "shadow-card h-full rounded-2xl transition group-hover:-translate-y-0.5 group-hover:shadow-card-lg",
                    t.status === "TERCAPAI" && "border-emerald-200"
                  )}
                >
                  <CardContent className="px-5 py-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{t.title}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {t.studentName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          targetStatusStyle(t.status)
                        )}
                      >
                        {targetStatusLabel(t.status)}
                      </span>
                    </div>

                    <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          t.status === "TERCAPAI"
                            ? "bg-emerald-500"
                            : t.status === "TERLAMBAT"
                              ? "bg-amber-500"
                              : "bg-gradient-brand"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t.currentValue} / {t.targetValue} {t.unit ?? ""}
                      </span>
                      <span className="font-bold text-foreground">{pct}%</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                      <span className="bg-role-soft text-role-strong rounded-md px-2 py-0.5 text-[11px] font-semibold">
                        {TARGET_MODULE_LABELS[t.moduleType as TargetModule] ?? t.moduleType}
                        {TARGET_MODULES.includes(t.moduleType as TargetModule) && t.moduleType !== "CUSTOM"
                          ? ""
                          : ""}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                        s.d. {new Date(t.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        <ChevronRight className="size-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
