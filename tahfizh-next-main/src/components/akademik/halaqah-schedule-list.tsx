import { CalendarClock } from "lucide-react";

import { CardBox } from "@/components/dashboard/section";
import type { ScheduleRow } from "@/lib/akademik";

const DAY_LABEL: Record<string, string> = {
  SENIN: "Senin",
  SELASA: "Selasa",
  RABU: "Rabu",
  KAMIS: "Kamis",
  JUMAT: "Jumat",
  SABTU: "Sabtu",
  MINGGU: "Minggu",
};

/**
 * TAHFIZH V11 (#15) — Daftar jadwal pembelajaran untuk satu halaqah,
 * ditampilkan pada halaman detail (admin & ustadz). Read-only.
 */
export function HalaqahScheduleList({ schedules }: { schedules: ScheduleRow[] }) {
  if (schedules.length === 0) {
    return (
      <CardBox>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">Jadwal Pembelajaran</h3>
            <p className="text-muted-foreground text-sm">
              Belum ada jadwal untuk halaqah ini. Admin dapat mengaturnya di menu Jadwal Pembelajaran.
            </p>
          </div>
        </div>
      </CardBox>
    );
  }

  return (
    <CardBox>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
          <CalendarClock className="size-5" />
        </span>
        <h3 className="font-semibold text-foreground">Jadwal Pembelajaran</h3>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {schedules.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-xl border border-role/15 bg-role-soft/40 px-4 py-2.5 text-sm"
          >
            <span className="font-semibold text-foreground">{DAY_LABEL[s.day] ?? s.day}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {s.startTime}–{s.endTime}
              {s.room ? ` · ${s.room}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </CardBox>
  );
}
