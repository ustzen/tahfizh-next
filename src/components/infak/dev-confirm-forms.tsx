"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmPaymentAction } from "@/app/actions/v10";

export function DevConfirmForms({ transactionId }: { transactionId: string }) {
  const [state, formAction, pending] = useActionState(confirmPaymentAction, null);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="transactionId" value={transactionId} />
        <div className="space-y-1.5">
          <Label htmlFor="reason">Catatan (wajib saat menolak)</Label>
          <Textarea
            id="reason"
            name="reason"
            rows={2}
            placeholder="Contoh: bukti tidak jelas, nominal tidak sesuai…"
          />
        </div>
        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{state.error}</p>
        )}
        {state?.success && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{state.success}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="decision"
            value="APPROVE"
            disabled={pending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Check className="size-4" /> Konfirmasi Lunas
          </Button>
          <Button
            type="submit"
            name="decision"
            value="REJECT"
            disabled={pending}
            variant="outline"
            className="border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50"
          >
            <X className="size-4" /> Tolak
          </Button>
        </div>
      </form>
    </div>
  );
}
