import Link from "next/link";
import { HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { rupiah, PAYMENT_METHOD_LABEL, statusTone, TRANSACTION_STATUS_LABEL } from "@/lib/v10-shared";
import { formatDate } from "@/lib/utils";
import type { DevTxRow } from "@/lib/v10";

const STATUS_FILTERS = [
  { value: "ALL", label: "Semua" },
  { value: "WAITING_CONFIRM", label: "Menunggu Konfirmasi" },
  { value: "PAID", label: "Lunas" },
  { value: "PENDING", label: "Menunggu Pembayaran" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

export function DevTransactionsTable({
  rows,
  status,
  query,
}: {
  rows: DevTxRow[];
  status: string;
  query: string;
}) {
  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                asChild
                size="sm"
                variant={status === f.value ? "default" : "outline"}
                className={status === f.value ? "bg-blue-600 text-white" : ""}
              >
                <Link href={`/developer/infak/transaksi?status=${f.value}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>
                  {f.label}
                </Link>
              </Button>
            ))}
          </div>
          <form action="/developer/infak/transaksi" className="flex gap-2">
            <input type="hidden" name="status" value={status} />
            <input
              name="q"
              defaultValue={query}
              placeholder="Cari nama / lembaga / referensi…"
              className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button type="submit" size="sm" variant="outline">
              Cari
            </Button>
          </form>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5">Referensi</TableHead>
                  <TableHead>Lembaga</TableHead>
                  <TableHead>Pembayar</TableHead>
                  <TableHead>Santri</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="px-5">Tanggal</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="px-5 font-mono text-xs font-semibold text-role-strong">{t.reference}</TableCell>
                    <TableCell className="max-w-44 truncate text-muted-foreground">
                      {t.tenant_name} <span className="font-mono text-xs">· {t.tenant_code}</span>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{t.payer_name}</TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">{t.student_summary ?? "-"}</TableCell>
                    <TableCell className="text-right font-semibold">{rupiah(t.total_amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{PAYMENT_METHOD_LABEL[t.method] ?? t.method}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(t.status)}>
                        {TRANSACTION_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                    <TableCell className="px-5">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/developer/infak/transaksi/${t.id}`}>Detail</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HandCoins />
              </EmptyMedia>
              <EmptyTitle>Belum ada transaksi.</EmptyTitle>
              <EmptyDescription>
                Transaksi infak dari seluruh lembaga akan tampil di sini setelah dibuat.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
