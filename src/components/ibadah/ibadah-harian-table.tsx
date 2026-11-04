"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, TableProperties, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IbadahHarianRow } from "@/lib/ibadah";

/**
 * TAHFIZH V83 — Tabel ibadah harian per santri (role guru).
 *
 * Baris = santri, kolom = kegiatan ibadah aktif. ✓ = dikerjakan, ✗ = belum.
 * Guru bisa pindah tanggal (hari-hari sebelumnya) dan menyaring "siapa yang
 * belum mengerjakan ibadah X" sebagai bahan evaluasi, lalu menyalin daftarnya.
 */

type Activity = { id: string; label: string };

const FULL_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const CHIP_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Geser tanggal YYYY-MM-DD sebanyak n hari (aritmetika UTC, bebas zona waktu). */
function shiftDate(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function IbadahHarianTable({
  rows,
  activities,
  date,
  today,
  rpcReady = true,
}: {
  rows: IbadahHarianRow[];
  activities: Activity[];
  date: string;
  today: string;
  rpcReady?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activityId, setActivityId] = useState<string>("all");
  const [halaqah, setHalaqah] = useState<string>("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isToday = date === today;
  const hrefFor = (d: string) => (d === today ? pathname : `${pathname}?tanggal=${d}`);
  const goTo = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return;
    router.push(hrefFor(d));
  };

  // 7 hari terakhir sebagai tombol cepat.
  const quickDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDate(today, -i)),
    [today]
  );

  const halaqahOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.halaqahName) set.add(r.halaqahName);
    return [...set].sort((a, b) => a.localeCompare(b, "id"));
  }, [rows]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const done = new Set(r.doneIds);
        const missing = activities.filter((a) => !done.has(a.id));
        return {
          ...r,
          done,
          missing,
          doneCount: activities.length - missing.length,
          emptyAll: done.size === 0,
        };
      }),
    [rows, activities]
  );

  const visible = useMemo(
    () =>
      enriched.filter((r) => {
        if (halaqah !== "all" && r.halaqahName !== halaqah) return false;
        if (activityId !== "all") return !r.done.has(activityId);
        if (onlyMissing) return r.missing.length > 0;
        return true;
      }),
    [enriched, halaqah, activityId, onlyMissing]
  );

  const scoped = useMemo(
    () => enriched.filter((r) => halaqah === "all" || r.halaqahName === halaqah),
    [enriched, halaqah]
  );
  const notFilled = scoped.filter((r) => r.emptyAll).length;
  const complete = scoped.filter((r) => r.missing.length === 0 && activities.length > 0).length;

  const activeActivity = activities.find((a) => a.id === activityId) ?? null;
  // Saat memfilter satu ibadah, tampilkan hanya kolom itu agar fokus.
  const columns = activeActivity ? [activeActivity] : activities;

  async function copyList() {
    const title = activeActivity
      ? `Belum mengerjakan ${activeActivity.label} — ${FULL_FMT.format(new Date(`${date}T00:00:00Z`))}`
      : `Rekap ibadah ${FULL_FMT.format(new Date(`${date}T00:00:00Z`))}`;
    const lines = visible.map((r, i) => {
      const detail = activeActivity
        ? ""
        : r.emptyAll
          ? " — belum mengisi"
          : r.missing.length > 0
            ? ` — belum: ${r.missing.map((m) => m.label).join(", ")}`
            : " — lengkap";
      return `${i + 1}. ${r.studentName}${detail}`;
    });
    try {
      await navigator.clipboard.writeText([title, ...lines].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard tidak tersedia — abaikan */
    }
  }

  return (
    <div className="shadow-card border-role/15 relative mt-6 overflow-hidden rounded-2xl border">
      {/* Header */}
      <div className="bg-role-soft/20 flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
          <TableProperties className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight">Tabel Ibadah Harian</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Cek santri yang belum mengerjakan ibadah tertentu pada tanggal pilihan — bahan evaluasi.
          </p>
        </div>
      </div>

      {/* Navigasi tanggal */}
      <div className="space-y-3 border-t px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={hrefFor(shiftDate(date, -1))}
            aria-label="Hari sebelumnya"
            className="hover:bg-role-soft/60 flex size-8 items-center justify-center rounded-full border"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => goTo(e.target.value)}
            className="h-8 rounded-lg border bg-transparent px-2 text-sm font-semibold"
            aria-label="Pilih tanggal"
          />
          {isToday ? (
            <span
              aria-disabled
              className="flex size-8 items-center justify-center rounded-full border opacity-40"
            >
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link
              href={hrefFor(shiftDate(date, 1))}
              aria-label="Hari berikutnya"
              className="hover:bg-role-soft/60 flex size-8 items-center justify-center rounded-full border"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
          {!isToday && (
            <Link
              href={hrefFor(today)}
              className="bg-role text-role-ink rounded-full px-3 py-1 text-xs font-bold"
            >
              Hari ini
            </Link>
          )}
          <span className="text-muted-foreground text-xs font-semibold">
            {FULL_FMT.format(new Date(`${date}T00:00:00Z`))}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quickDays.map((d) => (
            <Link
              key={d}
              href={hrefFor(d)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition-colors",
                d === date
                  ? "bg-role text-role-ink border-transparent"
                  : "text-muted-foreground hover:bg-role-soft/60"
              )}
            >
              {d === today ? "Hari ini" : CHIP_FMT.format(new Date(`${d}T00:00:00Z`))}
            </Link>
          ))}
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            className="h-8 rounded-lg border bg-transparent px-2 text-xs font-semibold"
            aria-label="Filter ibadah"
          >
            <option value="all">Semua ibadah</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                Belum: {a.label}
              </option>
            ))}
          </select>
          {halaqahOptions.length > 1 && (
            <select
              value={halaqah}
              onChange={(e) => setHalaqah(e.target.value)}
              className="h-8 rounded-lg border bg-transparent px-2 text-xs font-semibold"
              aria-label="Filter halaqah"
            >
              <option value="all">Semua halaqah</option>
              {halaqahOptions.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          )}
          {activityId === "all" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="size-3.5"
              />
              Hanya yang ada kekurangan
            </label>
          )}
          <button
            type="button"
            onClick={copyList}
            disabled={visible.length === 0}
            className="hover:bg-role-soft/60 ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40"
          >
            <ClipboardCopy className="size-3.5" />
            {copied ? "Tersalin" : "Salin daftar"}
          </button>
        </div>

        {/* Ringkasan */}
        <div className="grid grid-cols-3 gap-2">
          <Stat value={scoped.length} label="santri" />
          <Stat value={complete} label="ibadah lengkap" tone="text-emerald-600" />
          <Stat value={notFilled} label="belum mengisi sama sekali" tone="text-rose-600" />
        </div>
      </div>

      {/* Tabel */}
      {!rpcReady ? (
        <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
          Data harian belum bisa dimuat. Jalankan migrasi V83 (ibadah_rekap_harian) di database lembaga.
        </p>
      ) : activities.length === 0 ? (
        <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
          Belum ada kegiatan ibadah aktif di katalog.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
          Belum ada santri binaan.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
          Tidak ada santri yang cocok dengan filter — semua sudah mengerjakan. Alhamdulillah.
        </p>
      ) : (
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <TableHead className="min-w-40">Nama Santri</TableHead>
                {columns.map((a) => (
                  <TableHead key={a.id} className="text-center text-xs whitespace-nowrap">
                    {a.label}
                  </TableHead>
                ))}
                <TableHead className="text-center text-xs">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r, i) => (
                <TableRow key={r.studentId}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <p className="text-sm font-semibold">{r.studentName}</p>
                    <p className="text-muted-foreground text-[0.65rem]">
                      {r.halaqahName ?? "Tanpa halaqah"}
                      {r.emptyAll && (
                        <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          belum mengisi
                        </span>
                      )}
                    </p>
                  </TableCell>
                  {columns.map((a) => {
                    const ok = r.done.has(a.id);
                    return (
                      <TableCell key={a.id} className="text-center">
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full",
                            ok
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                          )}
                          title={ok ? "Dikerjakan" : "Belum"}
                        >
                          {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-bold tabular-nums">
                    {r.doneCount}/{activities.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {!activeActivity && (
              <tfoot>
                <tr className="border-t-2 text-center text-[0.65rem] font-bold">
                  <td colSpan={2} className="text-muted-foreground px-3 py-2 text-left">
                    Belum mengerjakan
                  </td>
                  {activities.map((a) => (
                    <td key={a.id} className="px-2 py-2 tabular-nums text-rose-600">
                      {scoped.filter((r) => !r.done.has(a.id)).length}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2 text-center">
      <p className={cn("text-lg leading-none font-extrabold tabular-nums", tone)}>{value}</p>
      <p className="text-muted-foreground mt-1 text-[0.6rem]">{label}</p>
    </div>
  );
}
