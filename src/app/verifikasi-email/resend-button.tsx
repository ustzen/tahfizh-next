"use client";

import { useState, useTransition } from "react";

import { resendVerificationAction } from "@/app/actions/verification";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";

export function VerificationResendButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);

  const send = () =>
    startTransition(async () => {
      const res = await resendVerificationAction();
      setMsg(res);
    });

  return (
    <div className="space-y-3">
      <Button onClick={send} disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending && <Spinner />} Kirim Ulang Email Verifikasi
      </Button>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg?.success && <p className="text-sm font-medium text-emerald-700">{msg.success}</p>}
    </div>
  );
}
