"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Plus, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bulanId, persen, tanggalId, type PresensiRekap } from "@/lib/santri-pantauan-shared";

type Status = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

const STATUS_VIEW: Record<
  Status,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    tile: string;
    solid: string;
    tone: string;
    chip: string;
  }
> = {
  HADIR: {
    label: "Hadir",
    Icon: Check,
    tile: "border-emerald-100 bg-emerald-50/70",
    solid: "bg-emerald-500",
    tone: "text-emerald-700",
    chip: "border-emerald-100 bg-emerald-50",
  },
  IZIN: {
    label: "Izin",
    Icon: Clock,
    tile: "border-blue-100 bg-blue-50/70",
    solid: "bg-blue-500",
    tone: "text-blue-700",
    chip: "border-blue-100 bg-blue-50",
  },
  SAKIT: {
    label: "Sakit",
    Icon: Plus,
    tile: "border-amber-100 bg-amber-50/70",
    solid: "bg-amber-500",
    tone: "text-amber-700",
    chip: "border-amber-100 bg-amber-50",
  },
  ALPA: {
    label: "Alpha",
    Icon: X,
    tile: "border-rose-100 bg-rose-50/70",
    solid: "bg-rose-500",
    tone: "text-rose-700",
    chip: "border-rose-100 bg-rose-50",
  },
};

const TILES: { key: Status; field: "hadir" | "izin" | "sakit" | "alpa" }[] = [
  { key: "HADIR", field: "hadir" },
  { key: "IZIN", field: "izin" },
  { key: "SAKIT", field: "sakit" },
  { key: "ALPA", field: "alpa" },
];

/** Tanggal panjang Bahasa Indonesia, mis. "30 September 2026". */
function longDate(value: string | null | undefined) {
  if (!value) return "-";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function pctTone(p: number) {
  if (p >= 90) return "bg-emerald-50 text-emerald-700";
  if (p >= 70) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

/**
 * Kartu Rekap Presensi (santri) — mengikuti mockup: ringkasan 4 status, tabel
 * per bulan, dan detail kehadiran sesuai bulan yang dipilih (default = bulan
 * terbaru / "1 Bulan Terakhir").
 */
export function PresensiRekapCard({ rekap }: { rekap: PresensiRekap }) {
  const months = rekap.months ?? [];
  const [ym, setYm] = useState(months[0]?.ym ?? "");
  const records = rekap.records && rekap.records.length > 0 ? rekap.records : (rekap.recent ?? []);
  const latestDate = records[0]?.date ?? null;
  const total = rekap.summary.total;

  const detail = useMemo(() => {
    const list = ym ? records.filter((r) => (r.date ?? "").slice(0, 7) === ym) : records;
    return list.slice(0, 40);
  }, [records, ym]);

  const isLatest = months[0]?.ym === ym;
  const detailTitle = isLatest
    ? "Detail Kehadiran 1 Bulan Terakhir"
    : `Detail Kehadiran ${bulanId(ym)}`;

  return (
    <div className="shadow-card rounded-3xl border bg-white p-4 sm:p-5">
      {/* Kepala kartu: nama + data terbaru + pemilih bulan */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
            <CalendarDays className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-extrabold tracking-tight text-sky-900">
              {rekap.studentName}
            </p>
            <p className="text-sm text-slate-500">{longDate(latestDate)} (Data terbaru)</p>
          </div>
        </div>

        {months.length > 0 && (
          <Select value={ym} onValueChange={setYm}>
            <SelectTrigger className="h-10 gap-2 rounded-xl border-sky-100 bg-white px-3 font-semibold text-sky-800">
              <CalendarDays className="size-4 text-sky-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.ym} value={m.ym} className="font-medium">
                  {bulanId(m.ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Ubin ringkasan */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ key, field }) => {
          const c = STATUS_VIEW[key];
          const value = rekap.summary[field] ?? 0;
          const Icon = c.Icon;
          return (
            <div key={key} className={cn("rounded-2xl border p-3.5", c.tile)}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-white",
                    c.solid
                  )}
                >
                  <Icon className="size-4" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className={cn("text-sm font-bold", c.tone)}>{c.label}</p>
                  <p className={cn("tabular text-2xl leading-tight font-extrabold", c.tone)}>
                    {value}
                  </p>
                </div>
                <Icon className={cn("ml-auto size-5 opacity-30", c.tone)} strokeWidth={2.5} />
              </div>
              <p className={cn("mt-2 text-xs font-medium opacity-80", c.tone)}>
                {persen(value, total)}% dari {total} hari
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabel per bulan */}
      {months.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-sky-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-sky-50/80 text-sky-800">
                <tr className="text-left text-[0.72rem] font-bold tracking-wider uppercase">
                  <th className="px-4 py-3">Bulan</th>
                  <th className="px-2 py-3 text-center">Hadir</th>
                  <th className="px-2 py-3 text-center">Izin</th>
                  <th className="px-2 py-3 text-center">Sakit</th>
                  <th className="px-2 py-3 text-center">Alpha</th>
                  <th className="px-4 py-3 text-right">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {months.map((m) => {
                  const p = persen(m.hadir, m.total);
                  return (
                    <tr key={m.ym}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-slate-700">
                          <CalendarDays className="size-4 text-sky-400" />
                          {bulanId(m.ym)}
                        </span>
                      </td>
                      <td className="tabular px-2 py-2.5 text-center">{m.hadir}</td>
                      <td className="tabular px-2 py-2.5 text-center">{m.izin}</td>
                      <td className="tabular px-2 py-2.5 text-center">{m.sakit}</td>
                      <td className="tabular px-2 py-2.5 text-center">{m.alpa}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={cn(
                            "tabular inline-block rounded-lg px-2.5 py-1 text-xs font-bold",
                            pctTone(p)
                          )}
                        >
                          {p}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail kehadiran (mengikuti bulan terpilih) */}
      <div className="mt-5">
        <p className="flex items-center gap-2 text-sm font-bold text-sky-900">
          <CalendarDays className="size-4 text-sky-500" />
          {detailTitle}
        </p>
        {detail.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">Belum ada presensi pada bulan ini.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {detail.map((x, i) => {
              const c = STATUS_VIEW[x.status as Status] ?? STATUS_VIEW.HADIR;
              const Icon = c.Icon;
              return (
                <li
                  key={`${x.date}-${i}`}
                  title={x.note ?? undefined}
                  className={cn("rounded-xl border px-3 py-1.5 text-center", c.chip)}
                >
                  <p className="text-[0.72rem] font-medium text-slate-500">{tanggalId(x.date)}</p>
                  <p className={cn("flex items-center justify-center gap-1 text-xs font-bold", c.tone)}>
                    <Icon className="size-3.5" strokeWidth={3} />
                    {c.label}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
