import { Info } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getPaymentSettings } from "@/lib/v10";
import { PaymentSettingsForm } from "@/components/infak/payment-settings-form";

export const metadata = { title: "Pengaturan Infak" };

export default async function DeveloperInfakSettingsPage() {
  await requireRole(["DEVELOPER"], "/developer/infak/pengaturan");
  const settings = await getPaymentSettings();

  return (
    <div>
      <PageHeader
        title="Pengaturan Infak Pengembangan"
        description="Nominal tagihan, rekening tujuan, QRIS, dan instruksi pembayaran — satu pengaturan untuk semua lembaga."
      />

      <CardBox className="mb-6 border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <Info className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Berlaku untuk seluruh santri di semua lembaga</h3>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Nominal minimal <strong>Rp1.000</strong> per santri per bulan. Tagihan dibuat otomatis
              setiap <strong>tanggal 1</strong>, batas pembayaran maksimal <strong>tanggal 15</strong>.
              Perubahan nominal berlaku untuk tagihan yang dibuat setelahnya; tagihan yang sudah ada tidak berubah.
              Dana masuk ke rekening di bawah ini, bukan ke lembaga.
            </p>
          </div>
        </div>
      </CardBox>

      <PaymentSettingsForm settings={settings} />
    </div>
  );
}
