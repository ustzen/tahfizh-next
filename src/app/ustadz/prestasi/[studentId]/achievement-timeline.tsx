"use client";

import { useMemo, useState } from "react";
import { AudioLines, BookOpenCheck, BookOpenText, ClipboardList, HandHeart, NotebookPen, ListChecks, SpellCheck, Trophy } from "lucide-react";

import type { AchievementEntry } from "@/lib/tartil";
import { SUBMISSION_RESULT_LABELS } from "@/lib/setoran-shared";
import { learningStatusLabel } from "@/lib/learning-shared";
import { cn } from "@/lib/utils";

type Props = {
  entries: AchievementEntry[];
  santriLabel: string;
};

const MODULE_STYLE: Record<string, { label: string; icon: typeof Trophy; chip: string; dot: string }> = {
  TARTIL: {
    label: "Tartil",
    icon: AudioLines,
    chip: "border-cyan-200 bg-cyan-50 text-cyan-800",
    dot: "bg-cyan-500",
  },
  TAHFIDZ: {
    label: "Tahfidz",
    icon: BookOpenCheck,
    chip: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
  },
  SETORAN: {
    label: "Setoran",
    icon: ClipboardList,
    chip: "border-violet-200 bg-violet-50 text-violet-800",
    dot: "bg-violet-500",
  },
  HADITS: {
    label: "Hadits",
    icon: BookOpenText,
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  DOA: {
    label: "Doa Harian",
    icon: HandHeart,
    chip: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
  },
  TAJWID: {
    label: "Tajwid",
    icon: SpellCheck,
    chip: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  TUGAS: {
    label: "Tugas",
    icon: ListChecks,
    chip: "border-orange-200 bg-orange-50 text-orange-800",
    dot: "bg-orange-500",
  },
  JURNAL: {
    label: "Jurnal",
    icon: NotebookPen,
    chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    dot: "bg-fuchsia-500",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function scoreText(e: AchievementEntry) {
  if (e.status !== "DINILAI") return e.status === "DIPELAJARI" ? "Dipelajari" : "Belum";
  if (e.scoreLabel) return e.scoreLabel;
  if (e.scoreValue !== null) return String(e.scoreValue);
  return "✓";
}

export function AchievementTimeline({ entries, santriLabel }: Props) {
  const [filter, setFilter] = useState<
    "ALL" | "TARTIL" | "TAHFIDZ" | "SETORAN" | "HADITS" | "DOA" | "TAJWID" | "TUGAS" | "JURNAL"
  >("ALL");

  const filtered = useMemo(
    () => (filter === "ALL" ? entries : entries.filter((e) => e.module === filter)),
    [entries, filter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AchievementEntry[]>();
    for (const e of filtered) {
      const key = new Date(e.occurredAt).toISOString().slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-gradient-brand flex size-10 items-center justify-center rounded-xl text-white shadow-card">
            <Trophy className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Perkembangan {santriLabel}</p>
            <p className="text-muted-foreground text-xs">
              Terisi otomatis dari Tartil, Tahfidz, Setoran, Hadits, Doa & Tajwid — tanpa input ganda.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "ALL", l: "Semua" },
              { v: "TARTIL", l: "Tartil" },
              { v: "TAHFIDZ", l: "Tahfidz" },
              { v: "SETORAN", l: "Setoran" },
              { v: "HADITS", l: "Hadits" },
              { v: "DOA", l: "Doa Harian" },
              { v: "TAJWID", l: "Tajwid" },
              { v: "TUGAS", l: "Tugas" },
              { v: "JURNAL", l: "Jurnal" },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                filter === f.v
                  ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="py-10 text-center">
          <Trophy className="text-muted-foreground mx-auto size-8 opacity-50" />
          <p className="text-muted-foreground mt-3 text-sm">
            Belum ada catatan prestasi untuk filter ini.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-6 border-l-2 border-role/15 pl-6">
          {grouped.map(([date, items]) => (
            <li key={date} className="relative">
              <p className="mb-2.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {formatDate(items[0].occurredAt)}
              </p>
              <ul className="space-y-3">
                {items.map((e, i) => {
                  const style = MODULE_STYLE[e.module] ?? MODULE_STYLE.TAHFIDZ;
                  const Icon = style.icon;
                  return (
                    <li
                      key={`${e.refId}-${i}`}
                      className={cn(
                        "rounded-xl border bg-white p-4 shadow-card transition-shadow hover:shadow-card-lg",
                        "border-slate-100"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold",
                            style.chip
                          )}
                        >
                          <Icon className="size-3" /> {style.label}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {e.title}
                          {e.module === "SETORAN" && e.notes?.status ? (
                            <span className="text-muted-foreground font-normal"> · {SUBMISSION_RESULT_LABELS[e.notes.status as keyof typeof SUBMISSION_RESULT_LABELS] ?? String(e.notes.status)}</span>
                          ) : null}
                          {(e.module === "HADITS" || e.module === "DOA" || e.module === "TAJWID") && e.notes?.status ? (
                            <span className="text-muted-foreground font-normal"> · {learningStatusLabel(String(e.notes.status))}</span>
                          ) : null}
                          {e.module === "TUGAS" && e.subtitle ? (
                            <span className="text-muted-foreground font-normal"> · modul {e.subtitle}</span>
                          ) : null}
                          {e.module === "JURNAL" ? null : null}
                          {e.subtitle ? (
                            <span className="text-muted-foreground font-normal"> · {e.subtitle}</span>
                          ) : null}
                        </span>
                        <span className="bg-gradient-brand ml-auto inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                          {scoreText(e)}
                        </span>
                      </div>
                      {Object.entries(e.notes ?? {}).length > 0 && (
                        <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                          {Object.entries(e.notes).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-semibold text-muted-foreground">{k}:</span> {v}
                            </li>
                          ))}
                        </ul>
                      )}
                      {e.teacherName && (
                        <p className="text-muted-foreground mt-1.5 text-xs">Penilai: {e.teacherName}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
