"use client";

import { Crown, ShieldAlert, UserRound } from "lucide-react";

import { CardBox, SectionTitle } from "@/components/dashboard/section";
import { cn } from "@/lib/utils";
import type { AttendanceLeaderRow } from "@/lib/halaqah";

/**
 * TAHFIZH V48 — Rangkuman kehadiran berwarna: 10 santri paling rajin dan
 * 10 santri paling sering tidak hadir. Bar mini = rasio kehadiran.
 */

const MEDAL = [
  "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm",
  "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-sm",
  "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm",
];

function LeaderPanel({
  title,
  description,
  icon,
  tone,
  rows,
  valueLabel,
  valueClass,
  barClass,
  rankStyle,
  noteWhenEmpty,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: string;
  rows: AttendanceLeaderRow[];
  valueLabel: (r: AttendanceLeaderRow) => string;
  valueClass: string;
  barClass: string;
  rankStyle: (i: number) => string;
  noteWhenEmpty: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border shadow-card">
      <div className={cn("flex items-center gap-3 px-5 py-4", tone)}>
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/20">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-[0.7rem] text-white/80">{description}</p>
        </div>
      </div>
      <div className="bg-card px-3 py-3">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">{noteWhenEmpty}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r, i) => (
              <li key={r.studentId} className="flex items-center gap-3 px-2 py-2.5">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-black",
                    rankStyle(i)
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.studentName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full sm:w-32">
                      <div
                        className={cn("h-full rounded-full transition-all", barClass)}
                        style={{ width: `${Math.min(100, r.persen)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-[0.65rem]">
                      {r.hadir}/{r.total} sesi
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums",
                    valueClass
                  )}
                >
                  {valueLabel(r)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AttendanceLeaderboard({
  rajin,
  alpa,
  unavailable,
}: {
  rajin: AttendanceLeaderRow[];
  alpa: AttendanceLeaderRow[];
  /** True bila RPC belum tersedia (migration V48 belum dijalankan). */
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Rangkuman belum tersedia
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Fungsi database <code className="font-mono">attendance_leaderboard</code> belum ada.
          Jalankan migration <span className="font-mono">V48</span> di Supabase, lalu muat ulang halaman.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        tone="violet"
        icon={<UserRound />}
        title="Rangkuman Santri"
        description="Perbandingan kehadiran santri berdasarkan seluruh sesi presensi halaqah."
        className="px-1"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <LeaderPanel
          title="Paling Rajin"
          description="Rasio kehadiran tertinggi"
          icon={<Crown className="size-5 text-white" />}
          tone="bg-gradient-to-r from-emerald-500 to-teal-500"
          rows={rajin}
          valueLabel={(r) => `${r.persen}%`}
          valueClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          barClass="bg-gradient-to-r from-emerald-400 to-teal-500"
          rankStyle={(i) =>
            MEDAL[i] ?? "bg-muted text-muted-foreground"
          }
          noteWhenEmpty="Belum ada data presensi."
        />
        <LeaderPanel
          title="Paling Sering Tidak Hadir"
          description="Alpa + izin + sakit tergabung"
          icon={<ShieldAlert className="size-5 text-white" />}
          tone="bg-gradient-to-r from-red-500 to-rose-500"
          rows={alpa}
          valueLabel={(r) => `${r.izin + r.sakit + r.alpa}× absen`}
          valueClass="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          barClass="bg-gradient-to-r from-red-400 to-rose-500"
          rankStyle={(i) =>
            i === 0
              ? "bg-red-500 text-white"
              : i === 1
                ? "bg-orange-500 text-white"
                : i === 2
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-muted-foreground"
          }
          noteWhenEmpty="Belum ada data presensi."
        />
      </div>
    </div>
  );
}
