"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { savePaymentSettingsAction, type V10Result } from "@/app/actions/v10";
import type { PaymentSettingsData } from "@/lib/v10";

export function PaymentSettingsForm({ settings }: { settings: PaymentSettingsData | null }) {
  const [state, formAction, pending] = useActionState(savePaymentSettingsAction, null);

  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="defaultAmount">Nominal default (Rp)</Label>
              <Input
                id="defaultAmount"
                name="defaultAmount"
                type="number"
                min={1000}
                step={500}
                defaultValue={settings?.default_amount ?? 1000}
                required
              />
              <p className="text-muted-foreground text-xs">Minimal Rp1.000 per santri per bulan — berlaku untuk semua lembaga.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadlineDays">Batas konfirmasi bukti (hari)</Label>
              <Input
                id="deadlineDays"
                name="deadlineDays"
                type="number"
                min={1}
                max={14}
                defaultValue={settings?.confirm_deadline_days ?? 3}
              />
              <p className="text-muted-foreground text-xs">Informasi bagi wali: berapa hari bukti transfer dikonfirmasi.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Nama bank</Label>
              <Input id="bankName" name="bankName" defaultValue={settings?.bank_name ?? ""} placeholder="BSI" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankNo">Nomor rekening</Label>
              <Input id="bankNo" name="bankNo" defaultValue={settings?.bank_account_no ?? ""} placeholder="7123456789" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccount">Atas nama</Label>
              <Input id="bankAccount" name="bankAccount" defaultValue={settings?.bank_account_name ?? ""} placeholder="Developer Platform TAHFIZH" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructions">Instruksi pembayaran</Label>
            <Textarea
              id="instructions"
              name="instructions"
              rows={3}
              defaultValue={settings?.instructions ?? ""}
              placeholder="Transfer ke rekening di atas, lalu unggah bukti transfer di halaman Infak."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmNote">Catatan tambahan</Label>
            <Textarea
              id="confirmNote"
              name="confirmNote"
              rows={2}
              defaultValue={settings?.confirm_note ?? ""}
              placeholder="Konfirmasi dilakukan maksimal 1x24 jam pada hari kerja."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qris">QRIS (opsional)</Label>
            <Input id="qris" name="qris" type="file" accept="image/jpeg,image/png,image/webp" />
            <p className="text-muted-foreground text-xs">
              JPG/PNG/WebP, maks 2 MB. {settings?.qris_path ? "QRIS saat ini sudah terpasang — unggah baru untuk mengganti." : "Belum ada QRIS terpasang."}
            </p>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{state.error}</p>
          )}
          {state?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{state.success}</p>
          )}

          <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending ? "Menyimpan…" : "Simpan Pengaturan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
