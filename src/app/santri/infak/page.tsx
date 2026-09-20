import { AlertTriangle, Lock } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRole } from "@/lib/auth";
import { getPaymentGate, getWaliHistory, getWaliInvoices, getWaliTransactions } from "@/lib/v10";
import { WaliPaymentPanel } from "@/components/infak/wali-payment-panel";
import { InfakHistoryCard } from "@/components/infak/infak-history-card";
import { isIpaymuConfigured } from "@/lib/ipaymu";
import { rupiah } from "@/lib/v10-shared";

export const metadata = { title: "Infak Pengembangan" };

/**
 * Halaman Infak Santri (rule #8/#9). When the gate is locked (day ≥ 16 & unpaid)
 * only this page is shown with payment instructions; all other menus are
 * blocked at the layout level.
 */
export default async function SantriInfakPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/infak");

  const [gate, invoices, transactions, history] = await Promise.all([
    getPaymentGate(),
    getWaliInvoices(),
    getWaliTransactions(),
    getWaliHistory(12),
  ]);

  const locked = gate?.locked === true;
  const bank = invoices?.bank ?? null;

  if (locked) {
    return (
      <div>
        <PageHeader
          title="Infak Pengembangan"
          description="Akses Anda dibatasi hingga pembayaran bulan ini terkonfirmasi."
        />

        <CardBox className="border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Lock className="size-5" />
            </span>
            <div className="text-sm">
              <h3 className="font-semibold text-foreground">
                Infak Pengembangan bulan {gate?.monthLabel ?? ""} belum terkonfirmasi.
              </h3>
              <ul className="text-muted-foreground mt-2 space-y-1">
                <li>Bulan: <span className="font-semibold text-foreground/85">{gate?.monthLabel}</span></li>
                <li>Nominal minimum: <span className="font-semibold text-foreground/85">{rupiah(gate?.minAmount ?? 1000)} / santri</span></li>
                <li>Tagihan belum lunas: <span className="font-semibold text-foreground/85">{gate?.unpaidCount ?? 0} santri</span></li>
                <li>Batas pembayaran: maksimal tanggal 15 — pembatasan akses mulai tanggal 16</li>
              </ul>
            </div>
          </div>
        </CardBox>

        <div className="mt-6">
          <WaliPaymentPanel
            kids={invoices?.children ?? []}
            others={invoices?.others ?? []}
            defaultAmount={invoices?.defaultAmount ?? 1000}
            academicYear={invoices?.academicYear ?? "-"}
            bank={bank}
            transactions={transactions}
            autoEnabled={isIpaymuConfigured()}
            currentY={gate?.year ?? new Date().getFullYear()}
            currentM={gate?.month ?? new Date().getMonth() + 1}
          />
        </div>

        <InfakHistoryCard className="mt-6" history={history} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Infak Pengembangan"
        description="Dukung pengembangan TAHFIZH — mulai Rp1.000 per bulan per santri. Bisa untuk beberapa bulan sekaligus dan untuk santri lain di lembaga Anda."
      />

      {invoices ? (
        <div className="space-y-6">
        <WaliPaymentPanel
          kids={invoices.children}
          others={invoices.others}
          defaultAmount={invoices.defaultAmount}
          academicYear={invoices.academicYear}
          bank={bank}
          transactions={transactions}
          autoEnabled={isIpaymuConfigured()}
          currentY={invoices.y}
          currentM={invoices.m}
        />
        <InfakHistoryCard history={history} />
        </div>
      ) : (
        <CardBox className="p-0">
          <Empty className="py-14">
            <EmptyMedia
              variant="icon"
              className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            >
              <AlertTriangle />
            </EmptyMedia>
            <EmptyTitle>Data infak belum bisa ditampilkan</EmptyTitle>
            <EmptyDescription>
              Ini bukan sesuatu yang perlu Anda atur sendiri — akun santri seharusnya otomatis
              terhubung ke datanya sendiri. Kemungkinan ada gangguan sementara pada sistem.
              Silakan muat ulang halaman, atau hubungi Admin/Developer bila terus berlanjut.
            </EmptyDescription>
          </Empty>
        </CardBox>
      )}
    </div>
  );
}
