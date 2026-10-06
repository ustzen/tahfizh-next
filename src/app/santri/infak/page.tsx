import Link from "next/link";
import { ChevronLeft, Info, Lock, Sprout } from "lucide-react";

import { CardBox } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getPhosphorIcon } from "@/components/icons/phosphor-icons";
import {
  getPaymentGate,
  getWaliHistory,
  getWaliInvoices,
  getWaliTransactions,
  getWaliWaiverRequests,
} from "@/lib/v10";
import { WaliPaymentPanel } from "@/components/infak/wali-payment-panel";
import { isIpaymuConfigured } from "@/lib/ipaymu";
import { rupiah } from "@/lib/v10-shared";

export const metadata = { title: "Infak Pengembangan" };

/**
 * Hero halaman Infak (mockup terbaru): banner langit berawan dengan ikon
 * masjid, lalu kartu biru "Infak Pengembangan <TA>" dengan kutipan
 * "Dari kita, untuk masa depan pendidikan mereka."
 */
function InfakHero({ academicYear, minAmount }: { academicYear: string; minAmount: number }) {
  const MosqueIcon = getPhosphorIcon("Mosque");
  return (
    <>
      <header className="shadow-card relative overflow-hidden rounded-2xl">
        <div className="relative bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 px-5 pt-5 pb-7 sm:px-7 dark:from-sky-950 dark:via-sky-900/70 dark:to-sky-900/40">
          {/* Awan halus — dekoratif */}
          <span aria-hidden className="absolute -top-2 right-28 h-9 w-24 rounded-full bg-white/60 blur-md" />
          <span aria-hidden className="absolute top-7 right-6 h-7 w-16 rounded-full bg-white/45 blur-md" />
          <span aria-hidden className="absolute bottom-0 left-0 h-10 w-full bg-gradient-to-t from-white/70 to-transparent dark:from-sky-950/60" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Link
                href="/santri"
                aria-label="Kembali ke dasbor"
                className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sky-900/70 transition-colors hover:bg-white/60 hover:text-sky-950 dark:text-sky-100/80 dark:hover:bg-white/10"
              >
                <ChevronLeft className="size-6" />
              </Link>
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold tracking-tight text-sky-950 sm:text-2xl dark:text-white">
                  Infak Pengembangan
                </h2>
                <p className="mt-1 text-sm font-medium text-sky-900/75 dark:text-sky-100/75">
                  Bersama kita wujudkan pendidikan
                  <br />
                  yang lebih baik.
                </p>
              </div>
            </div>
            <span className="shadow-card flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 dark:bg-white/15 dark:text-sky-200">
              {MosqueIcon ? <MosqueIcon className="size-7" /> : <Sprout className="size-6" />}
            </span>
          </div>
        </div>
      </header>

      <div className="shadow-card-lg relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 p-5 sm:p-6">
        <span
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-y-0 right-0 w-44 text-white/25 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="shadow-card flex size-14 shrink-0 items-center justify-center rounded-full bg-white/95 text-sky-600">
            <Sprout className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
              Infak Pengembangan {academicYear}
            </p>
            <p className="mt-0.5 text-sm text-sky-50/90">
              Dana pengembangan platform, mulai {rupiah(minAmount)}/bulan/santri
            </p>
          </div>
          <p className="hidden shrink-0 text-right text-sm italic leading-snug text-white/95 sm:block">
            “Dari kita,
            <br />
            untuk masa depan
            <br />
            pendidikan mereka.”
            <span className="mx-auto mt-1.5 block h-1 w-16 rounded-full bg-amber-300" />
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * Halaman Infak Santri (rule #8/#9). When the gate is locked (day ≥ 16 & unpaid)
 * only this page is shown with payment instructions; all other menus are
 * blocked at the layout level.
 */
export default async function SantriInfakPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/infak");

  const [gate, invoices, transactions, history, waiverRequests] = await Promise.all([
    getPaymentGate(),
    getWaliInvoices(),
    getWaliTransactions(),
    getWaliHistory(12),
    getWaliWaiverRequests(),
  ]);

  const locked = gate?.locked === true;
  const bank = invoices?.bank ?? null;
  const waiverKids = (invoices?.children ?? []).map((c) => ({
    studentId: c.studentId,
    name: c.name,
    code: c.code,
  }));

  if (locked) {
    return (
      <div className="space-y-6">
        <InfakHero
          academicYear={gate?.academicYear ?? "-"}
          minAmount={gate?.minAmount ?? 1000}
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
          waiverKids={waiverKids}
          waiverRequests={waiverRequests}
          history={history}
          payerName={profile.fullName}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InfakHero
        academicYear={invoices?.academicYear ?? "-"}
        minAmount={invoices?.defaultAmount ?? 1000}
      />

      {/* V18 — panel infak SELALU tampil (jadi header halaman sekaligus panel
          pembayaran). Bila RPC tagihan sedang tidak dapat
          dibaca, panel tetap dirender dengan nilai dasar agar santri tetap bisa
          melihat nominal, rekening, dan riwayatnya. */}
      {!invoices && (
        <CardBox className="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              <Info className="size-4.5" />
            </span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Rincian tagihan bulan ini belum termuat. Anda tetap dapat melihat nominal infak,
              informasi rekening, dan riwayat pembayaran di bawah. Muat ulang halaman bila
              tagihan belum muncul.
            </p>
          </div>
        </CardBox>
      )}

      <WaliPaymentPanel
        kids={invoices?.children ?? []}
        others={invoices?.others ?? []}
        defaultAmount={invoices?.defaultAmount ?? 1000}
        academicYear={invoices?.academicYear ?? "-"}
        bank={bank}
        transactions={transactions}
        autoEnabled={isIpaymuConfigured()}
        currentY={invoices?.y ?? new Date().getFullYear()}
        currentM={invoices?.m ?? new Date().getMonth() + 1}
        waiverKids={waiverKids}
        waiverRequests={waiverRequests}
        history={history}
        payerName={profile.fullName}
      />
    </div>
  );
}
