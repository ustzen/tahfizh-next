"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Calculator, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  cancelTargetAction,
  refreshTargetProgressAction,
  setTargetProgressAction,
} from "@/app/actions/v7";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProgressControls({
  targetId,
  isCustom,
  currentValue,
  targetValue,
  status,
}: {
  targetId: string;
  isCustom: boolean;
  currentValue: number;
  targetValue: number;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(currentValue));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = status === "TERCAPAI" || status === "DIBATALKAN";

  async function run(fn: () => Promise<{ error?: string; success?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    if (res.error) {
      setError(res.error);
    } else {
      toast.success(res.success ?? "Berhasil.");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardHeader>
        <CardTitle>{isCustom ? "Perbarui Progress Manual" : "Hitung dari Data"}</CardTitle>
        <CardDescription>
          {isCustom
            ? "Target custom diperbarui manual oleh guru."
            : "Progress dihitung dari data penilaian aktual santri (rule #11 — tanpa angka dummy)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCustom && !done && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="progress">Progress Saat Ini</Label>
              <Input
                id="progress"
                type="number"
                min={0}
                max={targetValue}
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  setTargetProgressAction({ targetId, value: Number(value) })
                )
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Simpan Progress
            </Button>
          </div>
        )}

        {!isCustom && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="border-role/25 text-role-strong hover:bg-role-soft"
            onClick={() => run(() => refreshTargetProgressAction({ targetId }))}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
            Hitung Ulang dari Data
          </Button>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}

        {status !== "DIBATALKAN" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="text-muted-foreground hover:bg-muted hover:text-foreground/85"
            onClick={() => {
              if (window.confirm("Batalkan target ini? Status akan berubah menjadi Dibatalkan.")) {
                run(() => cancelTargetAction({ targetId }));
              }
            }}
          >
            <XCircle className="size-4" /> Batalkan Target
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
