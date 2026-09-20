"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check } from "lucide-react";

import { saveTerminologyAction, type SettingsResult } from "@/app/actions/settings";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TERMINOLOGY, TERMINOLOGY_KEYS, type TerminologyKey } from "@/lib/terminology-shared";

const KEY_LABELS: Record<TerminologyKey, string> = {
  santri: "Nama Santri",
  guru: "Guru",
  ustadz: "Ustadz (Laki-laki)",
  ustadzah: "Ustadzah (Perempuan)",
  wali_santri: "Santri",
  koordinator: "Koordinator",
  admin: "Admin",
  kepala_lembaga: "Kepala Sekolah / Pimpinan",
  lembaga: "Lembaga",
  kelas: "Kelas",
  halaqah: "Halaqah",
};

type CurrentMap = Record<TerminologyKey, string>;

export function TerminologyForm({ current }: { current: CurrentMap }) {
  const [state, formAction, pending] = useActionState<SettingsResult | null, FormData>(
    saveTerminologyAction,
    null
  );
  const [values, setValues] = useState<CurrentMap>(current);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setConfirmed(false);
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  const changed = useMemo(
    () => TERMINOLOGY_KEYS.filter((k) => values[k].trim() !== current[k]),
    [values, current]
  );
  const bigChange = changed.includes("santri") || changed.includes("lembaga");

  const previewSantri = values.santri.trim() || current.santri;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {TERMINOLOGY_KEYS.map((key) => {
          const isCustom = values[key] !== DEFAULT_TERMINOLOGY[key];
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`term_${key}`}>
                {KEY_LABELS[key]}
                {!isCustom && (
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">(default)</span>
                )}
              </Label>
              <Input
                id={`term_${key}`}
                name={`term_${key}`}
                maxLength={40}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                placeholder={DEFAULT_TERMINOLOGY[key]}
              />
              <input type="hidden" name={`default_${key}`} value={DEFAULT_TERMINOLOGY[key]} />
            </div>
          );
        })}
      </div>

      {/* Live preview (rule #37) */}
      <div className="rounded-xl bg-role-soft/60 px-4 py-3 text-sm text-role-strong ring-1 ring-role/20">
        <p className="font-semibold">Pratinjau</p>
        <p className="mt-1">
          Menu akan menampilkan <strong>&quot;Data {previewSantri}&quot;</strong> dan{" "}
          <strong>&quot;Tambah {previewSantri}&quot;</strong> — basis data tetap aman, hanya label UI
          yang berubah.
        </p>
      </div>

      {bigChange && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-300 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Perubahan berdampak
          </p>
          <p className="mt-1">
            Istilah <strong>{current.santri}</strong> akan diubah menjadi{" "}
            <strong>{previewSantri}</strong>. Seluruh label di dashboard lembaga ini akan mengikuti.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            Saya memahami perubahan ini
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending || changed.length === 0 || (bigChange && !confirmed)}
          className="bg-gradient-brand hover:opacity-90"
        >
          {pending && <Spinner />} Simpan Terminologi
        </Button>
        {changed.length === 0 && !pending && (
          <span className="text-muted-foreground text-xs">Masih menggunakan istilah saat ini.</span>
        )}
      </div>
    </form>
  );
}
