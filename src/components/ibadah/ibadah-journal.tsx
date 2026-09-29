"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  Flame,
  MoonStar,
  NotebookPen,
  Plus,
  Repeat,
  Sun,
  Sunrise,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deleteIbadahActivityAction,
  saveIbadahActivityAction,
  saveIbadahLogAction,
} from "@/app/actions/ibadah";

/**
 * TAHFIZH V51 — Jurnal Ibadah harian (client).
 *
 * Checklist kegiatan berwarna per anak: tap kartu = centang (simpan instan),
 * tap lagi = batal. Admin/koordinator/ustadz bisa menambah kegiatan sendiri
 * lewat form inline; kegiatan bawaan platform tidak bisa dihapus lembaga.
 */

export type IbadahActivity = {
  id: string;
  label: string;
  icon: string;
  tone: string;
  isBuiltin: boolean;
};

export type IbadahLogRow = {
  studentId: string;
  activityId: string;
  logDate: string;
  done: boolean;
};

/** Ikon per katalog (icon key dari DB). */
function ActivityIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className ?? "size-4.5";
  if (icon === "moonstar") return <MoonStar className={cls} />;
  if (icon === "sun") return <Sun className={cls} />;
  if (icon === "sunrise") return <Sunrise className={cls} />;
  if (icon === "repeat") return <Repeat className={cls} />;
  if (icon === "bookopen") return <BookOpen className={cls} />;
  return <Check className={cls} />;
}

/** Palet warna kartu kegiatan — berwarna tapi konsisten. */
const TONES: Record<string, { chip: string; on: string; ring: string }> = {
  emerald: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    on: "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
    ring: "hover:border-emerald-300",
  },
  blue: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    on: "border-blue-500 bg-blue-50 dark:bg-blue-500/10",
    ring: "hover:border-blue-300",
  },
  sky: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    on: "border-sky-500 bg-sky-50 dark:bg-sky-500/10",
    ring: "hover:border-sky-300",
  },
  violet: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    on: "border-violet-500 bg-violet-50 dark:bg-violet-500/10",
    ring: "hover:border-violet-300",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    on: "border-amber-500 bg-amber-50 dark:bg-amber-500/10",
    ring: "hover:border-amber-300",
  },
  orange: {
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    on: "border-orange-500 bg-orange-50 dark:bg-orange-500/10",
    ring: "hover:border-orange-300",
  },
  yellow: {
    chip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
    on: "border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10",
    ring: "hover:border-yellow-300",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    on: "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10",
    ring: "hover:border-indigo-300",
  },
};

function toneOf(tone: string) {
  return TONES[tone] ?? TONES.emerald;
}

/** Ringkasan 7 hari terakhir: jumlah kegiatan yang dicentang per hari. */
function WeekStrip({
  logs,
  activities,
  days,
}: {
  logs: IbadahLogRow[];
  activities: IbadahActivity[];
  days: string[];
}) {
  const doneByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      if (l.done) m.set(l.logDate, (m.get(l.logDate) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const n = doneByDate.get(d) ?? 0;
        const pct = activities.length > 0 ? n / activities.length : 0;
        const isToday = d === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <span className="text-muted-foreground text-[0.6rem] font-semibold">
              {new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short" }).slice(0, 3)}
            </span>
            <div
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-lg border text-[0.7rem] font-bold tabular-nums transition-colors",
                n === 0
                  ? "border-slate-200 bg-white text-muted-foreground dark:border-slate-500/20 dark:bg-transparent"
                  : pct >= 1
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : pct >= 0.5
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
                isToday && "ring-2 ring-role/40 ring-offset-1"
              )}
              title={`${n}/${activities.length} kegiatan · ${d}`}
            >
              {n > 0 ? n : "·"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IbadahJournal({
  kids,
  activities,
  initialLogs,
  days,
  today,
  canManage,
}: {
  /** Anak milik akun ini (wali) — biasanya 1 (akun santri) atau lebih. */
  kids: { studentId: string; name: string }[];
  /** Katalog kegiatan tenant + bawaan platform (hanya yang aktif). */
  activities: IbadahActivity[];
  /** Isian 30 hari terakhir milik anak-anak ini. */
  initialLogs: IbadahLogRow[];
  /** 7 tanggal (YYYY-MM-DD) untuk strip mingguan, urut lama → baru. */
  days: string[];
  /** Tanggal hari ini (YYYY-MM-DD, Asia/Jakarta) — bawaan dari server. */
  today: string;
  /** Admin/koordinator/ustadz bisa menambah kegiatan katalog. */
  canManage: boolean;
}) {
  const [studentId, setStudentId] = useState(kids[0]?.studentId ?? "");
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<IbadahLogRow[]>(initialLogs);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const todayLogs = useMemo(
    () => logs.filter((l) => l.studentId === studentId && l.logDate === date && l.done),
    [logs, studentId, date]
  );
  const doneIds = useMemo(() => new Set(todayLogs.map((l) => l.activityId)), [todayLogs]);
  const doneCount = doneIds.size;
  const allDone = activities.length > 0 && doneCount === activities.length;

  // Streak: hari berturut-turut (dari hari ini mundur) dengan minimal 1 kegiatan dicentang.
  const streak = useMemo(() => {
    let n = 0;
    const set = new Set(logs.filter((l) => l.studentId === studentId && l.done).map((l) => l.logDate));
    for (let i = 0; i < 60; i++) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
      if (set.has(key)) n++;
      else if (i > 0 || !set.has(today)) break;
    }
    return n;
  }, [logs, studentId, today]);

  function toggle(activity: IbadahActivity) {
    if (!studentId) return;
    const wasDone = doneIds.has(activity.id);
    const nextDone = !wasDone;
    // Optimis: perbarui UI dulu, simpan di belakang.
    setLogs((prev) => {
      const rest = prev.filter(
        (l) => !(l.studentId === studentId && l.activityId === activity.id && l.logDate === date)
      );
      return nextDone
        ? [...rest, { studentId, activityId: activity.id, logDate: date, done: true }]
        : rest;
    });
    startTransition(async () => {
      const fd = new FormData();
      fd.set("studentId", studentId);
      fd.set("activityId", activity.id);
      fd.set("date", date);
      fd.set("done", nextDone ? "1" : "0");
      const res = await saveIbadahLogAction(null, fd);
      if (res.error) {
        toast.error(res.error);
        setLogs((prev) =>
          wasDone
            ? [...prev, { studentId, activityId: activity.id, logDate: date, done: true }]
            : prev.filter(
                (l) => !(l.studentId === studentId && l.activityId === activity.id && l.logDate === date)
              )
        );
      } else if (res.success) {
        toast.success(res.success);
      }
    });
  }

  function addActivity() {
    const label = newLabel.trim();
    if (label.length < 2) {
      toast.error("Nama kegiatan minimal 2 karakter.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("label", label);
      const res = await saveIbadahActivityAction(null, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Ditambahkan.");
      setNewLabel("");
      setAddOpen(false);
      window.location.reload(); // katalog diperbarui di server
    });
  }

  function removeActivity(a: IbadahActivity) {
    if (a.isBuiltin) {
      toast.error("Kegiatan bawaan tidak bisa dihapus. Hubungi pengelola platform.");
      return;
    }
    if (!confirm(`Hapus kegiatan "${a.label}" dari katalog?`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", a.id);
      const res = await deleteIbadahActivityAction(null, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Dihapus.");
      window.location.reload();
    });
  }

  function shiftDate(delta: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    if (next > today) return;
    setDate(next);
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Akun belum tertaut ke baris santri manapun — centangan butuh studentId,
  // jadi tampilkan panduan, bukan kartu yang terlihat bisa diklik tapi diam.
  if (kids.length === 0) {
    return (
      <div className="space-y-4">
        <div className="border-role/15 bg-role-soft/20 shadow-card relative overflow-hidden rounded-2xl border">
          <div className="relative flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
              <NotebookPen className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold tracking-tight">Jurnal Ibadah Harian</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Tap kartu untuk mencatat ibadah — tersimpan otomatis.
              </p>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Akun ini belum terhubung ke data santri, jadi jurnal belum bisa diisi.
          Buka halaman lain di menu Santri untuk memicu penautan otomatis, atau
          hubungi admin lembaga agar akun ananda ditautkan ke profil santri.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header ringkasan */}
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
            <h3 className="text-base font-bold tracking-tight">Jurnal Ibadah Harian</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Tap kartu untuk mencatat ibadah — tersimpan otomatis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="border-role/15 rounded-xl border bg-white px-3 py-1.5 text-center dark:bg-transparent">
              <p className="text-lg leading-none font-extrabold tabular-nums">{doneCount}</p>
              <p className="text-muted-foreground text-[0.6rem]">dari {activities.length} kegiatan</p>
            </div>
            <div className="border-orange-200 rounded-xl border bg-orange-50 px-3 py-1.5 text-center dark:border-orange-500/30 dark:bg-orange-500/10">
              <p className="flex items-center justify-center gap-1 text-lg leading-none font-extrabold tabular-nums text-orange-600 dark:text-orange-300">
                <Flame className="size-4" />
                {streak}
              </p>
              <p className="text-[0.6rem] text-orange-700/80 dark:text-orange-300/80">hari beruntun</p>
            </div>
          </div>
        </div>

        {/* Pemilih anak + tanggal */}
        <div className="relative flex flex-wrap items-center gap-2 border-t px-5 py-3">
          {kids.length > 1 &&
            kids.map((k) => (
              <button
                key={k.studentId}
                type="button"
                onClick={() => setStudentId(k.studentId)}
                aria-pressed={k.studentId === studentId}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  k.studentId === studentId
                    ? "bg-role text-role-ink shadow-sm"
                    : "border-role/25 text-muted-foreground border bg-white hover:bg-role-soft/60 dark:bg-transparent"
                )}
              >
                {k.name}
              </button>
            ))}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="border-role/25 flex size-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-role-soft/60"
              aria-label="Hari sebelumnya"
            >
              ←
            </button>
            <span className="text-foreground/85 min-w-40 text-center text-xs font-semibold">{dateLabel}</span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={date >= today}
              className="border-role/25 disabled:opacity-40 flex size-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-role-soft/60"
              aria-label="Hari berikutnya"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Strip mingguan */}
      <div className="shadow-card rounded-2xl border bg-white p-4 dark:bg-card">
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold">
          <CalendarDays className="text-role size-3.5" />
          7 hari terakhir
        </p>
        <WeekStrip logs={logs} activities={activities} days={days} />
      </div>

      {/* Checklist kegiatan */}
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-bold">
            Checklist {dateLabel.toLowerCase()}
            {allDone && (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                ✓ Lengkap, masyaAllah!
              </span>
            )}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="bg-role text-role-ink inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" />
              Kegiatan
            </button>
          )}
        </div>

        {addOpen && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border bg-white p-3 dark:bg-card">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addActivity()}
              placeholder="Nama kegiatan baru (mis. Qiyamul Lail)…"
              maxLength={60}
              className="h-9 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              type="button"
              onClick={addActivity}
              disabled={pending}
              className="bg-role text-role-ink rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Tambah
            </button>
          </div>
        )}

        {activities.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Belum ada kegiatan ibadah di katalog lembaga. Admin/guru bisa menambahkannya lewat tombol Kegiatan.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {activities.map((a) => {
              const t = toneOf(a.tone);
              const on = doneIds.has(a.id);
              return (
                <div key={a.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => toggle(a)}
                    disabled={pending || !studentId}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full flex-col items-start gap-2.5 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98]",
                      on ? cn(t.on, "shadow-sm") : cn("border-slate-200 bg-white dark:border-slate-500/20 dark:bg-card", t.ring)
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl transition-colors",
                        on ? "bg-role text-role-ink" : t.chip
                      )}
                    >
                      <ActivityIcon icon={a.icon} />
                    </span>
                    <span className="w-full">
                      <span className="block text-sm leading-tight font-bold">{a.label}</span>
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold",
                          on ? "bg-role text-role-ink" : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300"
                        )}
                      >
                        {on ? <Check className="size-3" /> : null}
                        {on ? "Tercatat" : "Belum"}
                      </span>
                    </span>
                  </button>
                  {canManage && !a.isBuiltin && (
                    <button
                      type="button"
                      onClick={() => removeActivity(a)}
                      className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Hapus ${a.label}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
