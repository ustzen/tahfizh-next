"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { generateInvoicesAction } from "@/app/actions/v10";

export function GenerateInvoicesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleGenerate() {
    setMessage(null);
    startTransition(async () => {
      const res = await generateInvoicesAction();
      setMessage(res.error ?? res.success ?? null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={handleGenerate} disabled={pending} className="bg-gradient-brand hover:opacity-90">
        <CalendarPlus className="size-4" />
        {pending ? "Memproses…" : "Buat Tagihan Bulan Ini (Semua Lembaga)"}
      </Button>
      {message && <p className="text-muted-foreground text-xs">{message}</p>}
    </div>
  );
}
