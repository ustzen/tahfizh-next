"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { setTartilModeAction } from "@/app/actions/tartil";
import type { TahfidzMode } from "@/lib/tahfidz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MODES: { value: TahfidzMode; label: string; desc: string }[] = [
  { value: "CENTANG", label: "Centang", desc: "Checkbox ✓ — sesuai kebutuhan Tartil (default)" },
  { value: "HURUF", label: "Huruf", desc: "Grade A+, A, A- … D dari Pengaturan → Tahfidz" },
  { value: "ANGKA", label: "Angka", desc: "Nilai angka 1–100" },
];

/**
 * V12.16 — Mode nilai TARTIL per lembaga (tartil_settings), TERPISAH dari
 * mode Tahfidz & Setoran. Mengubah mode tidak menyentuh penilaian yang sudah
 * ada — hanya format input penilaian baru di Jurnal Mengaji.
 */
export function TartilModeSwitcher({ currentMode }: { currentMode: TahfidzMode }) {
  const [selected, setSelected] = useState<TahfidzMode>(currentMode);
  const [pending, startTransition] = useTransition();

  function choose(next: TahfidzMode) {
    if (next === selected || pending) return;
    setSelected(next);
    startTransition(async () => {
      const res = await setTartilModeAction(next);
      if (res.success) toast.success(res.success);
      else if (res.error) {
        toast.error(res.error);
        setSelected(currentMode); // kembalikan bila gagal
      }
    });
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">Mode Nilai Tartil</CardTitle>
        <CardDescription>
          Khusus modul Tartil — tidak memengaruhi mode Tahfidz maupun Setoran. Penilaian yang
          sudah tersimpan tidak berubah.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            disabled={pending}
            onClick={() => choose(m.value)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              selected === m.value
                ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10"
                : "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              {pending && selected === m.value ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {m.label}
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">{m.desc}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
