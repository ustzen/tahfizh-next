import Link from "next/link";
import { HandCoins } from "lucide-react";

import { CardBox } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WaliHistoryChild } from "@/lib/v10";
import {
  INVOICE_STATUS_LABEL,
  monthYearLabel,
  paidNote,
  rupiah,
  statusTone,
} from "@/lib/v10-shared";

/**
 * Riwayat infak PER BULAN untuk tiap anak. Pembayaran beberapa bulan sekaligus
 * tetap tampil satu baris per bulan; keterangan menyebut tanggal dibayarkan,
 * siapa yang membayarkan (bila santri lain yang membayar), dan apakah dibayar
 * di muka / sekaligus beberapa bulan.
 *
 * Server component murni — dipakai di dasbor santri dan halaman Infak.
 */
export function InfakHistoryCard({
  history,
  limit,
  showAllHref,
  className,
}: {
  history: WaliHistoryChild[];
  /** Batasi jumlah bulan per anak yang ditampilkan (default: semua data). */
  limit?: number;
  /** Bila diisi, tampil tautan "Lihat riwayat lengkap". */
  showAllHref?: string;
  className?: string;
}) {
  const children = history.filter((c) => c.items.length > 0);

  return (
    <CardBox className={className}>
      <div className="mb-1.5 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          <HandCoins className="size-5" />
        </span>
        <h3 className="text-base font-semibold text-foreground">Riwayat Infak per Bulan</h3>
      </div>
      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
        Satu baris per bulan. Infak yang dibayarkan sekaligus untuk beberapa bulan atau oleh santri lain
        tetap tercatat per bulan lengkap dengan tanggal dan pembayarnya.
      </p>

      {children.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Belum ada riwayat infak.</p>
      ) : (
        <div className="space-y-6">
          {children.map((child) => {
            const items = typeof limit === "number" ? child.items.slice(0, limit) : child.items;
            return (
              <div key={child.studentId}>
                {children.length > 1 && (
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    {child.name} <span className="text-muted-foreground font-mono text-xs">{child.code}</span>
                  </p>
                )}
                <ul className="divide-y overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-500/20">
                  {items.map((it) => {
                    const paid = it.status === "PAID";
                    return (
                      <li
                        key={it.id}
                        className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-500/10"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{monthYearLabel(it.y, it.m)}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                            {paid
                              ? paidNote(it)
                              : it.status === "WAITING_CONFIRM"
                                ? "Bukti pembayaran terkirim — menunggu konfirmasi."
                                : it.status === "PENDING"
                                  ? "Menunggu pembayaran diselesaikan."
                                  : "Belum dibayar."}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="text-sm font-bold text-foreground">{rupiah(it.amount)}</span>
                          <Badge variant="outline" className={cn("px-2.5 py-1", statusTone(it.status))}>
                            {INVOICE_STATUS_LABEL[it.status] ?? it.status}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {showAllHref && (
        <div className="mt-4 text-right">
          <Link href={showAllHref} className="text-sm font-semibold text-role-strong hover:underline">
            Lihat riwayat lengkap →
          </Link>
        </div>
      )}
    </CardBox>
  );
}
