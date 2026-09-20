"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import {
  saveIdentityTypesAction,
  deleteIdentityTypeAction,
  type SettingsResult,
} from "@/app/actions/settings";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IdentityType } from "@/lib/identity";

export function IdentityTypesForm({
  identityTypes,
  showTeacherIdentity,
}: {
  identityTypes: IdentityType[];
  showTeacherIdentity: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsResult | null, FormData>(
    saveIdentityTypesAction,
    null
  );
  const [rows, setRows] = useState<string[]>(() =>
    identityTypes.length > 0 ? identityTypes.map((t) => t.label) : [""]
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        {rows.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              name="identityLabel"
              value={value}
              maxLength={30}
              placeholder="Contoh: NIP, NBM, NUPTK, NIY, ID Pegawai"
              onChange={(e) =>
                setRows((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))
              }
              className="sm:max-w-md"
            />
            <button
              type="button"
              aria-label="Hapus baris"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="rounded-lg p-2 text-muted-foreground/80 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, ""])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-role-strong hover:underline"
      >
        <Plus className="size-4" /> Tambah jenis identitas
      </button>

      <label className="flex items-start gap-3 rounded-xl border bg-slate-50/60 px-4 py-3.5">
        <Checkbox name="showTeacherIdentity" defaultChecked={showTeacherIdentity} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium text-foreground">
            Tampilkan identitas guru pada dokumen/raport
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
            Pengaturan ini disimpan sekarang; penerapannya pada dokumen menyusul di versi
            berikutnya.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending && <Spinner />} Simpan Konfigurasi Identitas
      </Button>
    </form>
  );
}

export function DeleteIdentityTypeButton({ identityKey }: { identityKey: string }) {
  const [state, formAction, pending] = useActionState<SettingsResult | null, FormData>(
    deleteIdentityTypeAction,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="key" value={identityKey} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-red-600 dark:text-red-300 hover:bg-red-50">
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}
