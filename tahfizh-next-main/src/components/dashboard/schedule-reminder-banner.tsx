import { CalendarClock } from "lucide-react";
import Link from "next/link";

import type { ScheduleReminder } from "@/lib/schedule-reminder";

/**
 * V12.13 — Banner pengingat sesi halaqah di dasbor ustadz.
 * Menampilkan jadwal HARI INI (masih/akan berjalan) dan BESOK (H-1),
 * diambil dari learning_schedules yang diampu guru.
 */
export function ScheduleReminderBanner({ reminders }: { reminders: ScheduleReminder[] }) {
  if (reminders.length === 0) return null;

  const today = reminders.filter((r) => r.daysUntil === 0);
  const tomorrow = reminders.filter((r) => r.daysUntil === 1);

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Jadwal Halaqah</p>
          <div className="mt-2 space-y-1.5">
            {today.map((r) => (
              <p key={`t-${r.halaqahName}-${r.startTime}`} className="text-sm text-slate-700 dark:text-slate-300">
                <span className="mr-2 inline-flex items-center rounded-full bg-role text-role-ink px-2 py-0.5 text-[0.65rem] font-bold">
                  HARI INI
                </span>
                <strong>{r.halaqahName}</strong> · {r.startTime}–{r.endTime}
                {r.room ? ` · ${r.room}` : ""}
              </p>
            ))}
            {tomorrow.map((r) => (
              <p key={`b-${r.halaqahName}-${r.startTime}`} className="text-sm text-slate-600 dark:text-slate-400">
                <span className="mr-2 inline-flex items-center rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[0.65rem] font-bold text-blue-700 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-300">
                  BESOK
                </span>
                <strong>{r.halaqahName}</strong> · {r.startTime}–{r.endTime}
                {r.room ? ` · ${r.room}` : ""}
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
            <Link href="/ustadz/presensi" className="font-medium hover:underline">
              Buka menu Presensi →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
