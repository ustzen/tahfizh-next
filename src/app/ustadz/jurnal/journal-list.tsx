"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NotebookPen, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { JournalEntryRow } from "@/lib/v7";
import { cn } from "@/lib/utils";

export function JournalListClient({
  entries,
  santriLabel,
}: {
  entries: JournalEntryRow[];
  santriLabel: string;
}) {
  const [template, setTemplate] = useState("ALL");
  const [query, setQuery] = useState("");

  const templateNames = useMemo(
    () => [...new Set(entries.map((e) => e.templateName))],
    [entries]
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (template !== "ALL" && e.templateName !== template) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const valuesText = Object.values(e.valuesSummary).join(" ").toLowerCase();
        if (
          !e.studentName.toLowerCase().includes(q) &&
          !e.studentCode.toLowerCase().includes(q) &&
          !e.templateName.toLowerCase().includes(q) &&
          !(e.freeText ?? "").toLowerCase().includes(q) &&
          !valuesText.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [entries, template, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {["ALL", ...templateNames].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTemplate(name)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                template === name
                  ? "border-blue-600 bg-blue-600 text-white shadow-card"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              )}
            >
              {name === "ALL" ? "Semua" : name}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari santri, isi, atau catatan…"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-role-soft text-role">
              <NotebookPen className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Belum ada jurnal.</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Tulis jurnal pertama menggunakan template yang tersedia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <Link key={e.id} href={`/ustadz/jurnal/${e.id}/edit`} className="group block">
              <Card className="shadow-card h-full rounded-2xl transition group-hover:-translate-y-0.5 group-hover:shadow-card-lg">
                <CardContent className="px-5 py-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 rounded-md px-2 py-0.5 text-[11px] font-semibold">
                      {e.templateName}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {new Date(e.entryDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <p className="truncate text-sm font-bold text-foreground">{e.studentName}</p>

                  {Object.keys(e.valuesSummary).length > 0 && (
                    <ul className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5">
                      {Object.entries(e.valuesSummary)
                        .slice(0, 3)
                        .map(([label, value]) => (
                          <li key={label} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/85">{label}:</span> {value}
                          </li>
                        ))}
                    </ul>
                  )}
                  {e.freeText && (
                    <p className="text-muted-foreground mt-2 line-clamp-2 text-xs italic">“{e.freeText}”</p>
                  )}
                  <p className="text-muted-foreground mt-2 text-[11px]">oleh {e.teacherName ?? "—"}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
