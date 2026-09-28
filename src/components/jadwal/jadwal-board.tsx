"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardX,
  Clock,
  MapPin,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { ScheduleManager } from "@/components/akademik/schedule-manager";
import { CardBox, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DAY_LABEL, WEEK_DAYS, formatTanggalSingkat } from "@/lib/jadwal-shared";
import type { JadwalBoardData as Board, MissingPresensi } from "@/lib/jadwal-shared";

/**
 * TAHFIZH V47 — Papan Jadwal (Master Data).
 * - Banner "Belum Dipresensi": tanggal jadwal yang lewat tanpa sesi presensi.
 * - Papan per hari: Senin..Minggu, kartu sesi dengan jam/ruang/pengampu.
 * - ADMIN mendapat panel kelola (ScheduleManager V11); koordinator & guru
 *   melihat papan read-only.
 */
export function JadwalBoard({
  board,
  studentLabel,
  halaqahs,
  canManage,
  /**
   * Pola tautan notifikasi per role: guru → lembar presensi (isi langsung),
   * admin/koordinator → detail halaqah (tinjau). Placeholder %HALAQAH% dan
   * %TANGGAL% diganti dengan id/tanggal saat render.
   */
  missingHrefTemplate,
}: {
  board: Board;
  studentLabel: string;
  halaqahs: { id: string; name: string; code: string }[];
  canManage: boolean;
  missingHrefTemplate: string;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Board["schedules"]>();
    for (const d of WEEK_DAYS) map.set(d, []);
    for (const s of board.schedules) {
      map.get(s.day)?.push(s);
    }
    return map;
  }, [board.schedules]);

  const totalSesi = board.schedules.length;
  const totalRuang = new Set(board.schedules.map((s) => s.room).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Notifikasi: jadwal lewat, belum diisi presensi */}
      {board.missing.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white p-4 dark:border-amber-500/30 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-transparent">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {board.missing.length} Sesi Belum Dipresensi
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Jadwal di bawah sudah lewat tetapi belum ada data presensi. Klik untuk mengisi.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {board.missing.map((m) => (
                  <MissingChip key={`${m.halaqahId}-${m.date}-${m.startTime}`} m={m} hrefTemplate={missingHrefTemplate} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat icon={<CalendarDays className="size-4" />} label="Sesi / Minggu" value={String(totalSesi)} />
        <MiniStat icon={<Clock className="size-4" />} label="Hari Mengajar" value={String(byDay.size > 0 ? [...byDay.values()].filter((v) => v.length > 0).length : 0)} />
        <MiniStat icon={<MapPin className="size-4" />} label="Ruang Terpakai" value={String(totalRuang)} />
      </div>

      {/* Papan per hari */}
      <div className="grid gap-4 lg:grid-cols-2">
        {WEEK_DAYS.map((day) => {
          const items = byDay.get(day) ?? [];
          const isToday = day === board.todayCode;
          return (
            <CardBox
              key={day}
              className={cn(
                "transition-shadow",
                isToday && "ring-2 ring-role/30",
                items.length === 0 && !isToday && "opacity-75"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold tracking-tight">{DAY_LABEL[day] ?? day}</h3>
                  {isToday && (
                    <Badge className="bg-role text-role-ink border-transparent text-[0.65rem]">HARI INI</Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {items.length > 0 ? `${items.length} sesi` : "—"}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground/70">
                    Tidak ada jadwal.
                  </p>
                ) : (
                  items.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-role-soft/40 px-3 py-2.5"
                    >
                      <div className="bg-role text-role-ink rounded-lg px-2 py-1 font-mono text-[0.7rem] font-bold leading-tight">
                        {s.startTime}
                        <span className="block opacity-70">{s.endTime}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.halaqahName}</p>
                        <p className="text-muted-foreground truncate text-[0.7rem]">
                          {s.halaqahCode}
                          {s.room ? ` · ${s.room}` : ""}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardBox>
          );
        })}
      </div>

      {/* Panel kelola (ADMIN) */}
      {canManage && (
        <CardBox>
          <SectionTitle
            tone="blue"
            icon={<Plus />}
            title="Kelola Jadwal"
            description="Tambah, ubah, atau hapus sesi pembelajaran per halaqah."
          />
          <div className="mt-4">
            <ScheduleManager schedules={board.schedules} halaqahs={halaqahs} halaqahLabel="Halaqah" />
          </div>
        </CardBox>
      )}
    </div>
  );
}

function MissingChip({ m, hrefTemplate }: { m: MissingPresensi; hrefTemplate: string }) {
  const overdue =
    m.isToday ? "Hari ini" : m.daysOverdue === 1 ? "Kemarin" : `${m.daysOverdue} hari lalu`;
  const href = hrefTemplate
    .replaceAll("%HALAQAH%", m.halaqahId)
    .replaceAll("%TANGGAL%", m.date);
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2 text-xs transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-slate-900/60 dark:hover:bg-amber-500/10"
    >
      <ClipboardX className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1 truncate">
        <strong className="font-semibold">{m.halaqahName}</strong>
        <span className="text-muted-foreground">
          {" "}
          · {formatTanggalSingkat(m.date)} · {m.startTime}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        {overdue}
      </span>
    </Link>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-role-soft border-role/15 rounded-2xl border px-4 py-3">
      <p className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem] font-medium">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
