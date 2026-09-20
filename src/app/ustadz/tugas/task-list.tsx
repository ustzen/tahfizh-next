"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, ListChecks, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  TASK_STATUS_DOTS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TASK_MODULE_OPTIONS,
  taskStatusLabel,
  taskStatusStyle,
} from "@/lib/v7-shared";
import type { TaskRow } from "@/lib/v7";
import { cn } from "@/lib/utils";

const FILTERS = ["SEMUA", ...TASK_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

export function TaskListClient({
  tasks,
  santriLabel,
}: {
  tasks: TaskRow[];
  santriLabel: string;
}) {
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter !== "SEMUA" && t.status !== filter) return false;
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
  }, [tasks, filter, query]);

  function dueLabel(task: TaskRow) {
    const d = new Date(task.dueDate);
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
    const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    if (days < 0 && t_active(task.status)) return `${label} · lewat ${Math.abs(days)} hari`;
    if (days === 0 && t_active(task.status)) return `${label} · hari ini`;
    return label;
  }

  function t_active(status: string) {
    return status === "BELUM_DIKERJAKAN" || status === "DIKERJAKAN";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                filter === f
                  ? "border-blue-600 bg-blue-600 text-white shadow-card"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              )}
            >
              {f === "SEMUA" ? "Semua" : TASK_STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 sm:justify-end">
          <div className="relative flex-1 sm:max-w-64">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Cari judul atau ${santriLabel.toLowerCase()}…`}
              className="pl-9"
            />
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/ustadz/tugas/new">
              <Plus className="size-4" /> Tugas Baru
            </Link>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-role-soft text-role">
              <ListChecks className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Belum ada tugas.</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Buat tugas pertama untuk {santriLabel.toLowerCase()} halaqah Anda.
            </p>
            <Button asChild size="sm" className="mt-1">
              <Link href="/ustadz/tugas/new">Buat Tugas</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <Link key={t.id} href={`/ustadz/tugas/${t.id}`} className="group block">
              <Card
                className={cn(
                  "shadow-card h-full rounded-2xl transition group-hover:-translate-y-0.5 group-hover:shadow-card-lg",
                  t.status === "DINILAI" && "border-emerald-200"
                )}
              >
                <CardContent className="px-5 py-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-bold text-foreground">{t.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        taskStatusStyle(t.status)
                      )}
                    >
                      {taskStatusLabel(t.status)}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {t.studentName}
                  </p>

                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px]">
                    <span className="bg-role-soft text-role-strong rounded-md px-2 py-0.5 font-semibold">
                      {TASK_MODULE_OPTIONS.find((m) => m.value === t.moduleType)?.label ?? t.moduleType}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        t_active(t.status) && new Date(t.dueDate) < new Date() ? "font-semibold text-amber-700" : "text-muted-foreground"
                      )}
                    >
                      <CalendarClock className="size-3.5" />
                      {dueLabel(t)}
                    </span>
                  </div>

                  {(t.scoreLabel || t.scoreValue !== null) && (
                    <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Nilai: {t.scoreLabel ?? t.scoreValue}
                      {t.teacherNote ? ` · ${t.teacherNote}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* status dots legend (rule #49 visual) */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 px-1 text-[11px]">
        {TASK_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", TASK_STATUS_DOTS[s])} />
            {TASK_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
