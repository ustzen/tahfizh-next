import Link from "next/link";
import { CalendarCheck, Flame, NotebookPen, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import type { IbadahRekapRow } from "@/lib/ibadah";

/**
 * TAHFIZH V52 — Kartu rekap ibadah di dasbor guru (server component).
 *
 * Bahan evaluasi halaqah: siapa santri paling rajin mengisi jurnal ibadah
 * (peringkat + bar rasio), statistik ringkas, dan siapa yang paling rajin
 * per kegiatan tertentu (sholat subuh, muraja'ah, dst).
 */

const MEDAL_TONES = [
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300",
];

const PILL_TONES = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
];

export function IbadahRekapCard({ rows, days = 30 }: { rows: IbadahRekapRow[]; days?: number }) {
  const totalDone = rows.reduce((s, r) => s + r.totalDone, 0);
  const totalActiveDays = rows.reduce((s, r) => s + r.activeDays, 0);

  // Siapa yang paling rajin per kegiatan: hitung maksimum per label kegiatan.
  const maxPerActivity = new Map<string, { cnt: number; student: string }>();
  for (const r of rows) {
    for (const [label, cnt] of Object.entries(r.perActivity ?? {})) {
      const prev = maxPerActivity.get(label);
      if (!prev || cnt > prev.cnt) maxPerActivity.set(label, { cnt, student: r.studentName });
    }
  }
  const topActivities = [...maxPerActivity.entries()]
    .sort((a, b) => b[1].cnt - a[1].cnt)
    .slice(0, 6);

  return (
    <div className="shadow-card border-role/15 bg-role-soft/20 relative mt-6 overflow-hidden rounded-2xl border">
      <span
        aria-hidden
        className="bg-dots text-role/15 pointer-events-none absolute -top-4 -right-4 h-28 w-44 [mask-image:linear-gradient(to_left,black,transparent)]"
      />
      <div className="relative flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
          <NotebookPen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight">Rekap Ibadah Santri</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Catatan jurnal ibadah {days} hari terakhir — bahan evaluasi halaqah.
          </p>
        </div>
        <Link
          href="/ustadz/jurnal-ibadah"
          className="border-role/25 text-muted-foreground hover:bg-role-soft/60 rounded-full border bg-white px-3 py-1 text-xs font-semibold transition-colors dark:bg-transparent"
        >
          Kelola Katalog
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
          Belum ada santri yang mengisi jurnal ibadah dalam {days} hari terakhir.
          Dorong wali/santri mencatat dari dasbor mereka — rekap muncul otomatis di sini.
        </p>
      ) : (
        <div className="relative grid gap-6 border-t px-5 py-4 md:grid-cols-2">
          {/* Kiri: peringkat paling rajin */}
          <div>
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold">
              <Trophy className="size-3.5 text-amber-500" />
              Paling Rajin Mencatat
            </p>
            <ul className="space-y-2">
              {rows.slice(0, 5).map((r, i) => (
                <li key={r.studentId} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-extrabold",
                      MEDAL_TONES[i] ?? MEDAL_TONES[3]
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{r.studentName}</span>
                      <span className="text-muted-foreground shrink-0 text-[0.65rem] font-semibold tabular-nums">
                        {r.totalDone}× · {r.activeDays} hari
                      </span>
                    </div>
                    <div className="bg-slate-100 mt-1 h-1.5 w-full overflow-hidden rounded-full dark:bg-slate-500/20">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        style={{ width: `${Math.max(4, r.activityRatio)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Kanan: statistik ringkas + paling rajin per ibadah */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-white px-3 py-2.5 text-center dark:bg-transparent">
                <p className="text-lg leading-none font-extrabold tabular-nums">{rows.length}</p>
                <p className="text-muted-foreground mt-1 text-[0.6rem]">santri aktif mencatat</p>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2.5 text-center dark:bg-transparent">
                <p className="flex items-center justify-center gap-1 text-lg leading-none font-extrabold tabular-nums">
                  <Flame className="size-4 text-orange-500" />
                  {totalDone}
                </p>
                <p className="text-muted-foreground mt-1 text-[0.6rem]">total ibadah tercatat</p>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2.5 text-center dark:bg-transparent">
                <p className="flex items-center justify-center gap-1 text-lg leading-none font-extrabold tabular-nums">
                  <CalendarCheck className="size-4 text-emerald-500" />
                  {totalActiveDays}
                </p>
                <p className="text-muted-foreground mt-1 text-[0.6rem]">hari aktif (semua santri)</p>
              </div>
            </div>

            {topActivities.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold">Paling Rajin per Ibadah</p>
                <div className="flex flex-wrap gap-1.5">
                  {topActivities.map(([label, top], i) => (
                    <span
                      key={label}
                      title={`${top.student} — ${top.cnt}× dalam ${days} hari`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold",
                        PILL_TONES[i % PILL_TONES.length]
                      )}
                    >
                      {label}
                      <span className="opacity-70">·</span>
                      <span className="tabular-nums">{top.cnt}×</span>
                      <span className="hidden font-semibold opacity-80 sm:inline">
                        ({top.student.split(" ")[0]})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-muted-foreground text-[0.65rem] leading-relaxed">
              Rasio = ibadah tercatat dibanding katalog aktif × hari aktif. Rekap otomatis
              mengikuti isian jurnal ibadah harian wali/santri.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
