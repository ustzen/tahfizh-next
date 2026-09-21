import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getDevTransactionDetail } from "@/lib/v10";
import { rupiah, PAYMENT_METHOD_LABEL, statusTone, TRANSACTION_STATUS_LABEL } from "@/lib/v10-shared";
import { formatDate } from "@/lib/utils";
import { DevConfirmForms } from "@/components/infak/dev-confirm-forms";

export const metadata = { title: "Detail Transaksi" };

export default async function DeveloperTransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  await requireRole(["DEVELOPER"], "/developer/infak/transaksi");
  const { transactionId } = await params;
  const tx = await getDevTransactionDetail(transactionId);
  if (!tx) notFound();

  // Signed URL for the uploaded proof (private bucket).
  let proofUrl: string | null = null;
  if (tx.proofPath) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(tx.proofPath, 60 * 30);
    proofUrl = data?.signedUrl ?? null;
  }

  const canDecide = tx.status === "WAITING_CONFIRM";

  return (
    <div>
      <PageHeader
        title={`Transaksi ${tx.reference}`}
        description={`${tx.payerName}${tx.tenantName ? ` · ${tx.tenantName}` : ""} · ${formatDate(tx.createdAt)}`}
        action={
          <Button asChild variant="outline">
            <Link href="/developer/infak/transaksi">
              <ArrowLeft className="size-4" /> Kembali
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CardBox>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Ringkasan</h3>
            <Badge variant="outline" className={statusTone(tx.status)}>
              {TRANSACTION_STATUS_LABEL[tx.status] ?? tx.status}
            </Badge>
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Pembayar</dt>
              <dd className="font-medium text-foreground">{tx.payerName}</dd>
            </div>
            {tx.payerAlias && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dibayarkan atas nama</dt>
                <dd className="font-medium text-foreground">
                  {tx.payerAlias}
                  <span className="text-muted-foreground ml-1 text-xs">(tampil ke santri)</span>
                </dd>
              </div>
            )}
            {tx.tenantName && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Lembaga</dt>
                <dd className="font-medium text-foreground">
                  {tx.tenantName} <span className="text-muted-foreground font-mono text-xs">· {tx.tenantCode}</span>
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Metode</dt>
              <dd className="font-medium text-foreground">{PAYMENT_METHOD_LABEL[tx.method] ?? tx.method}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-semibold text-foreground">{rupiah(tx.total)}</dd>
            </div>
            {tx.providerTrxId && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">ID penyedia</dt>
                <dd className="font-mono text-xs text-foreground/85">{tx.providerTrxId}</dd>
              </div>
            )}
            {tx.providerPaidVia && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dibayar via</dt>
                <dd className="font-medium text-foreground">{tx.providerPaidVia}</dd>
              </div>
            )}
            {tx.payerNote && (
              <div>
                <dt className="text-muted-foreground">Catatan wali</dt>
                <dd className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-slate-700 dark:bg-slate-500/5">{tx.payerNote}</dd>
              </div>
            )}
            {tx.rejectReason && (
              <div>
                <dt className="text-muted-foreground">Alasan penolakan</dt>
                <dd className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">{tx.rejectReason}</dd>
              </div>
            )}
            {tx.confirmedAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dikonfirmasi</dt>
                <dd className="font-medium text-foreground">{formatDate(tx.confirmedAt)}</dd>
              </div>
            )}
          </dl>

          <h4 className="mt-5 mb-2 text-sm font-semibold text-foreground">Alokasi Tagihan</h4>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-500/20">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Santri</TableHead>
                  <TableHead>Bulan</TableHead>
                  <TableHead className="text-right px-4">Nominal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.allocations.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 font-medium text-foreground">
                      {a.student}
                    </TableCell>
                    <TableCell>{String(a.m).padStart(2, "0")}/{a.y}</TableCell>
                    <TableCell className="px-4 text-right font-semibold">{rupiah(a.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBox>

        <div className="space-y-4">
          <CardBox>
            <h3 className="mb-3 font-semibold text-foreground">Bukti Transfer</h3>
            {proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt={`Bukti transfer ${tx.reference}`}
                  className="max-h-96 w-full rounded-xl border border-slate-200 object-contain dark:border-slate-500/20"
                />
              </a>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center rounded-xl border border-dashed py-10 text-sm">
                <FileText className="mb-2 size-6 opacity-50" />
                {tx.method === "IPAYMU"
                  ? "Pembayaran otomatis — bukti berupa konfirmasi dari penyedia pembayaran."
                  : "Belum ada bukti transfer diunggah."}
              </div>
            )}
          </CardBox>

          {canDecide ? (
            <CardBox>
              <h3 className="mb-3 font-semibold text-foreground">Keputusan</h3>
              <DevConfirmForms transactionId={tx.id} />
            </CardBox>
          ) : (
            <CardBox>
              <p className="text-muted-foreground text-sm">
                {tx.status === "PENDING"
                  ? "Wali belum mengunggah bukti transfer."
                  : tx.status === "PAID"
                    ? tx.method === "OFFLINE"
                      ? `Pelunasan dicatat Developer atas nama ${tx.payerAlias ?? tx.payerName}.`
                      : "Transaksi sudah lunas."
                    : "Transaksi ini tidak dapat dikonfirmasi ulang."}
              </p>
            </CardBox>
          )}
        </div>
      </div>
    </div>
  );
}
