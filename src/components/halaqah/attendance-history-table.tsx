"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/halaqah-shared";
import { formatTanggalSingkat } from "@/lib/jadwal-shared";
import type { AttendanceHistoryRow } from "@/lib/halaqah";

/**
 * TAHFIZH V47 — Riwayat Presensi (menu Presensi, bagian bawah).
 * Satu baris = satu tanggal sesi presensi: H/I/S/A + total santri dicatat.
 * 10 baris per halaman; halaman lebih lama lewat tombol pagination (?hal=n).
 */
export function AttendanceHistoryTable({
  halaqahId,
  basePath,
  rows,
  total,
  page,
  pageSize,
  periode,
  bulan,
}: {
  halaqahId: string;
  basePath: string;
  rows: AttendanceHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Konteks filter agar pagination tidak menghilangkan periode terpilih. */
  periode?: string;
  bulan?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (halaqahId) q.set("halaqah", halaqahId);
    if (periode) q.set("periode", periode);
    if (periode === "bulan" && bulan) q.set("bulan", String(bulan));
    q.set("hal", String(p + 1));
    return `${basePath}?${q.toString()}`;
  };

  const STATUS_CHIP: Record<AttendanceStatus, string> = {
    HADIR: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    IZIN: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    SAKIT: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    ALPA: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  };

  return (
    <CardBox>
      <SectionTitle
        tone="amber"
        icon={<Inbox />}
        title="Riwayat Presensi"
        description="Rekap per tanggal — klik tanggal untuk membuka lembar presensi tersebut."
      />

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
          Belum ada riwayat presensi untuk halaqah ini.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Tanggal</TableHead>
                  <TableHead className="text-center">Hadir</TableHead>
                  <TableHead className="text-center">Izin</TableHead>
                  <TableHead className="text-center">Sakit</TableHead>
                  <TableHead className="text-center">Alpa</TableHead>
                  <TableHead className="px-4 text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="px-4 font-medium">
                      <Link
                        href={`/ustadz/presensi?halaqah=${halaqahId}&tanggal=${r.date}`}
                        className="hover:text-role hover:underline"
                      >
                        {formatTanggalSingkat(r.date)}
                      </Link>
                    </TableCell>
                    {(["HADIR", "IZIN", "SAKIT", "ALPA"] as AttendanceStatus[]).map((st) => (
                      <TableCell key={st} className="text-center">
                        <span
                          className={cn(
                            "inline-flex min-w-8 justify-center rounded-md px-2 py-0.5 text-xs font-bold",
                            STATUS_CHIP[st]
                          )}
                        >
                          {r[st.toLowerCase() as "hadir" | "izin" | "sakit" | "alpa"]}
                        </span>
                      </TableCell>
                    ))}
                    <TableCell className="px-4 text-center font-semibold">{r.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
            <span>
              {total === 0 ? "0" : `${from}–${to}`} dari {total} sesi
            </span>
            <div className="flex items-center gap-1.5">
              <Button asChild variant="outline" size="sm" disabled={!hasPrev} className="h-8 gap-1 px-2">
                <Link href={pageHref(Math.max(page - 1, 0))} aria-disabled={!hasPrev}>
                  <ChevronLeft className="size-3.5" /> Sebelumnya
                </Link>
              </Button>
              <span className="px-1 font-medium">
                {page + 1} / {totalPages}
              </span>
              <Button asChild variant="outline" size="sm" disabled={!hasNext} className="h-8 gap-1 px-2">
                <Link href={pageHref(hasNext ? page + 1 : page)} aria-disabled={!hasNext}>
                  Berikutnya <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </CardBox>
  );
}
