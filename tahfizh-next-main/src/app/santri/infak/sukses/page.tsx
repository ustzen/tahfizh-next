import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { rupiah } from "@/lib/v10-shared";

export const metadata = { title: "Pembayaran Berhasil" };

/**
 * iPaymu return URL landing (rule #22). The source of truth remains the
 * webhook — this page tells the wali the payment session completed and their
 * access is restored as soon as the callback is processed.
 */
export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await requireRole(["WALI_SANTRI"], "/santri/infak");
  const { ref } = await searchParams;

  return (
    <div>
      <PageHeader title="Pembayaran" description="Status sesi pembayaran otomatis." />

      <CardBox>
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 className="size-7" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-foreground">Sesi pembayaran selesai</h3>
          <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
            Terima kasih atas Infak Pengembangan Anda{ref ? ` (ref. ${ref})` : ""}.
            Status lunas akan diperbarui otomatis begitu konfirmasi dari penyedia pembayaran
            diterima, dan akses aplikasi langsung terbuka kembali.
          </p>
          <div className="mt-5 flex gap-2">
            <Button asChild className="bg-gradient-brand hover:opacity-90">
              <Link href="/santri/infak">Lihat Status Infak</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/santri">Ke Dashboard</Link>
            </Button>
          </div>
        </div>
      </CardBox>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        Nominal infak minimum Rp1.000 per bulan — berapapun yang Anda berikan, jazakumullahu khairan.
      </p>
    </div>
  );
}
