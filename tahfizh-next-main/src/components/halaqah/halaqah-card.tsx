"use client";

import Link from "next/link";
import { ArrowRight, ScreenShare, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { HalaqahListItem } from "@/lib/halaqah-shared";

/**
 * V12.15 — Kartu halaqah gaya "kelas": body putih bersih, STRIP WARNA SOLID di
 * sisi atas, avatar inisial berwarna solid, baris pengampu, lalu chip jumlah
 * santri + tautan "Detail →". Warna dari indeks urutan agar stabil antar-render.
 * Dipakai bersama oleh halaman admin, koordinator, dan ustadz.
 */

const PALETTE = [
  { strip: "bg-blue-600", avatar: "bg-blue-600" },
  { strip: "bg-emerald-600", avatar: "bg-emerald-600" },
  { strip: "bg-violet-600", avatar: "bg-violet-600" },
  { strip: "bg-amber-500", avatar: "bg-amber-500" },
  { strip: "bg-rose-600", avatar: "bg-rose-600" },
  { strip: "bg-cyan-600", avatar: "bg-cyan-600" },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "H";
}

export function HalaqahCard({
  item,
  index,
  studentLabel,
  href,
  showStatus = true,
  isPrimary,
}: {
  item: HalaqahListItem;
  /** Posisi urutan (0-based) untuk memilih warna — stabil antar-render. */
  index: number;
  studentLabel: string;
  /** Target link detail (per role). */
  href: string;
  /** Tampilkan badge Aktif/Nonaktif (admin/koordinator). */
  showStatus?: boolean;
  /** Badge pengampu utama (ustadz). */
  isPrimary?: boolean;
}) {
  const tone = PALETTE[index % PALETTE.length];
  const inactive = item.status !== "ACTIVE";
  const label = studentLabel.toLowerCase();

  return (
    <Link
      href={href}
      className={cn(
        "group shadow-card hover:shadow-card-lg relative block overflow-hidden rounded-xl border border-slate-200/80 bg-white transition-all duration-200 hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-900",
        inactive && "opacity-70 saturate-50"
      )}
    >
      {/* Strip warna di sisi atas kartu */}
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1.5", tone.strip)} />

      <div className="px-5 pb-4 pt-5">
        {/* Avatar inisial + badge status */}
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-xl text-sm font-extrabold tracking-wide text-white shadow-sm",
              tone.avatar
            )}
          >
            {initials(item.name)}
          </span>
          <div className="flex items-center gap-1.5">
            {isPrimary ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-bold text-amber-700 dark:bg-yellow-500/15 dark:text-yellow-300">
                UTAMA
              </span>
            ) : null}
            {showStatus ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.65rem] font-bold",
                  inactive
                    ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                )}
              >
                {inactive ? "NONAKTIF" : "AKTIF"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Nama + pengampu */}
        <p className="mt-3 truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          {item.name}
        </p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 truncate text-[0.82rem]">
          <ScreenShare className="size-3.5 shrink-0 text-muted-foreground/80" />
          <span className="truncate">
            {item.teacherNames || <span className="italic">Belum ada pengampu</span>}
          </span>
        </p>

        {/* Baris bawah: chip santri + Detail */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[0.78rem] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Users className="size-3.5 text-blue-600 dark:text-blue-400" />
            {item.studentCount} {label} Aktif
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 transition-colors group-hover:text-blue-700 dark:text-blue-400">
            Detail
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
