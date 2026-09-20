"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";

import { saveLearningDaysAction, type V11Result } from "@/app/actions/akademik";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = [
  { value: "SENIN", label: "Senin" },
  { value: "SELASA", label: "Selasa" },
  { value: "RABU", label: "Rabu" },
  { value: "KAMIS", label: "Kamis" },
  { value: "JUMAT", label: "Jumat" },
  { value: "SABTU", label: "Sabtu" },
  { value: "MINGGU", label: "Minggu" },
];

/**
 * Hari pembelajaran settings (#13). Jam detail per halaqah lives on the
 * Jadwal tab — days stay a simple per-tenant toggle, matching the RPC design.
 */
export function LearningDaysForm({ days }: { days: string[] }) {
  const [selected, setSelected] = useState<string[]>(days);
  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    saveLearningDaysAction as never,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  function toggle(day: string) {
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {DAYS.map((d) => {
          const on = selected.includes(d.value);
          return (
            <label
              key={d.value}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
              }`}
            >
              <input
                type="checkbox"
                name="days"
                value={d.value}
                checked={on}
                onChange={() => toggle(d.value)}
                className="sr-only"
              />
              <CalendarDays className="size-4" />
              {d.label}
            </label>
          );
        })}
      </div>

      <div className="text-muted-foreground text-xs">
        Jam pembelajaran per halaqah diatur pada tab{" "}
        <span className="font-semibold text-role-strong">Jadwal Halaqah</span> (hari, jam mulai–selesai,
        ruang).
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note" className="text-xs">Catatan (opsional)</Label>
        <Input
          id="note"
          name="note"
          placeholder="Contoh: kegiatan dimulai pukul 07.00"
          defaultValue={""}
        />
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending && <Spinner />} SIMPAN HARI PEMBELAJARAN
      </Button>
    </form>
  );
}
