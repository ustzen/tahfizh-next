import Link from "next/link";
import { ArrowRight, Building2, Coins, HandCoins, HeartHandshake, Hourglass, Landmark } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import {
  getDevSummary,
  getDevTenantInvoices,
  getDevTransactions,
  getDevWaiverRequests,
  getPaymentSettings,
} from "@/lib/v10";
import { rupiah, statusTone, TRANSACTION_STATUS_LABEL, DUE_DAY } from "@/lib/v10-shared";
import { formatDate } from "@/lib/utils";
import { GenerateInvoicesButton } from "@/components/infak/generate-invoices-button";

export const metadata = { title: "Infak Pengembangan" };

export default async function DeveloperInfakPage() {
  await requireRole(["DEVELOPER"], "/developer/infak");

  const [summary, waiting, settings, tenants, waiverPending] = await Promise.all([
    getDevSummary(),
    getDevTransactions("WAITING_CONFIRM", ""),
    getPaymentSettings(),
    getDevTenantInvoices(),
    getDevWaiverRequests("PENDING", ""),
  ]);

  return (
    <div>
      <PageHeader
        title="Infak Pengembangan"
        description="Tagihan, pembayaran, dan konfirmasi infak seluruh santri dari semua lembaga."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/developer/infak/transaksi">Semua Transaksi</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/developer/infak/pelunasan">
                <HandCoins className="size-4" /> Pelunasan
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/developer/infak/pengajuan">
                <HeartHandshake className="size-4" /> Pengajuan Tidak Mampu
                {waiverPending.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[0.65rem] font-semibold text-white">
                    {waiverPending.length}
                  </span>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/developer/infak/pengaturan">
                <Landmark className="size-4" /> Pengaturan
              </Link>
            </Button>
            <GenerateInvoicesButton />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="invoice" label="Tagihan Bulan Ini" value={summary?.totalInvoices ?? 0} hint={`${summary?.monthLabel ?? ""} · ${summary?.tenantCount ?? 0} lembaga aktif`} />
        <StatCard
          icon="paid"
          label="Lunas"
          value={summary?.paidCount ?? 0}
          hint={`${summary?.unpaidCount ?? 0} belum bayar`}
          progress={summary?.totalInvoices ? ((summary?.paidCount ?? 0) / summary.totalInvoices) * 100 : undefined}
        />
        <StatCard icon="unpaid" label="Menunggu Konfirmasi" value={summary?.pendingConfirm ?? 0} hint="bukti transfer perlu diperiksa" />
        <StatCard
          icon="wallet"
          label="Total Terkumpul"
          value={rupiah(summary?.collectedTotal ?? 0)}
          hint={`Manual ${rupiah(summary?.manualTotal ?? 0)} · Otomatis ${rupiah(summary?.autoTotal ?? 0)}`}
        />
      </div>

      {/* Antrean konfirmasi bukti transfer (semua lembaga) */}
      <CardBox className="mt-6">
        <SectionTitle
          className="mb-3"
          tone="amber"
          icon={<Hourglass />}
          title="Menunggu Konfirmasi Bukti Transfer"
          description="Periksa bukti lalu konfirmasi pembayaran"
          action={
            <Link href="/developer/infak/transaksi?status=WAITING_CONFIRM" className="text-role-strong inline-flex items-center gap-1 text-sm font-semibold hover:underline">
              Lihat semua <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        {waiting.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Hourglass />
              </EmptyMedia>
              <EmptyTitle>Tidak ada antrean konfirmasi.</EmptyTitle>
              <EmptyDescription>Semua bukti transfer sudah diproses.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {waiting.slice(0, 5).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t.payer_name} <span className="text-muted-foreground font-mono text-xs">· {t.reference}</span>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {t.tenant_name} · {t.student_summary ?? "-"} · {formatDate(t.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular text-sm font-semibold">{rupiah(t.total_amount)}</span>
                  <Badge variant="outline" className={statusTone(t.status)}>
                    {TRANSACTION_STATUS_LABEL[t.status] ?? t.status}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/developer/infak/transaksi/${t.id}`}>
                      Konfirmasi <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBox>

      {/* Pelunasan manual oleh Developer */}
      <CardBox className="mt-6">
        <SectionTitle
          tone="emerald"
          icon={<HandCoins />}
          title="Pelunasan oleh Developer"
          description="untuk infak yang diterima di luar aplikasi (tunai, donatur, transfer lain)"
          action={
            <Link href="/developer/infak/pelunasan" className="text-role-strong inline-flex items-center gap-1 text-sm font-semibold hover:underline">
              Buka <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Pilih santri yang menunggak (diurutkan dari tunggakan paling lama), tuliskan{" "}
          <span className="font-medium text-foreground">dibayarkan oleh siapa</span>, lalu lunasi. Nama pembayar
          dan tanggal pelunasan langsung tampil pada riwayat infak santri yang bersangkutan.
        </p>
      </CardBox>

      {/* Pengajuan tidak mampu (keringanan infak) */}
      <CardBox className="mt-6">
        <SectionTitle
          tone="amber"
          icon={<HeartHandshake />}
          title="Pengajuan Tidak Mampu"
          description="keringanan infak dari wali santri, disertai Surat Keterangan Tidak Mampu"
          action={
            <Link href="/developer/infak/pengajuan" className="text-role-strong inline-flex items-center gap-1 text-sm font-semibold hover:underline">
              Buka <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {waiverPending.length > 0 ? (
            <>
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {waiverPending.length} pengajuan menunggu keputusan.{" "}
              </span>
            </>
          ) : (
            "Tidak ada pengajuan yang menunggu keputusan. "
          )}
          Setujui pengajuan untuk <span className="font-medium text-foreground">menggratiskan infak</span> santri
          tersebut dalam kurun waktu tertentu (dalam bulan).
        </p>
      </CardBox>

      {/* Ketentuan + rekening */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CardBox>
          <SectionTitle
            tone="blue"
            icon={<Coins />}
            title="Nominal Tagihan"
            description="per santri, berlaku untuk semua lembaga"
          />
          <p className="tabular mt-4 text-3xl font-bold text-role-strong">{rupiah(settings?.default_amount ?? 1000)}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Tagihan muncul otomatis setiap tanggal 1 untuk seluruh santri aktif di semua lembaga; batas
            pembayaran maksimal tanggal {DUE_DAY}. Mulai tanggal {DUE_DAY + 1}, wali yang belum membayar
            diarahkan ke halaman Infak.
          </p>
        </CardBox>

        <CardBox>
          <SectionTitle
            tone="emerald"
            icon={<Landmark />}
            title="Rekening & QRIS"
            description="ditampilkan ke wali santri"
          />
          <p className="mt-4 text-sm font-semibold text-foreground">
            {settings?.bank_name ? `${settings.bank_name} · ${settings.bank_account_no ?? "-"}` : "Belum dikonfigurasi"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {settings?.qris_path ? "QRIS terpasang." : "QRIS belum diunggah."} Pembayaran otomatis (iPaymu)
            diaktifkan lewat environment server.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/developer/infak/pengaturan">Kelola</Link>
          </Button>
        </CardBox>
      </div>

      {/* Rincian per lembaga */}
      <CardBox className="mt-6">
        <SectionTitle
          className="mb-3"
          tone="violet"
          icon={<Building2 />}
          title="Tagihan per Lembaga"
          description={summary?.monthLabel ?? "bulan ini"}
        />
        {tenants.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Belum ada lembaga aktif.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Lembaga</TableHead>
                  <TableHead className="text-right">Tagihan</TableHead>
                  <TableHead className="text-right text-emerald-700 dark:text-emerald-300">Lunas</TableHead>
                  <TableHead className="text-right text-rose-700 dark:text-rose-300">Belum Bayar</TableHead>
                  <TableHead className="text-right text-amber-700 dark:text-amber-300">Menunggu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-foreground">
                      {t.name} <span className="text-muted-foreground font-mono text-xs">· {t.code}</span>
                    </TableCell>
                    <TableCell className="tabular text-right">{t.total}</TableCell>
                    <TableCell className="tabular text-right font-semibold text-emerald-700 dark:text-emerald-300">{t.paid}</TableCell>
                    <TableCell className="tabular text-right font-semibold text-rose-700 dark:text-rose-300">{t.unpaid}</TableCell>
                    <TableCell className="tabular text-right font-semibold text-amber-700 dark:text-amber-300">{t.waiting}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardBox>
    </div>
  );
}
