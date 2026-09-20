"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { saveLeaderAction, type SettingsResult } from "@/app/actions/settings";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatFullName } from "@/lib/terminology-shared";
import type { IdentityType } from "@/lib/identity";

type LeaderData = {
  fullName: string;
  frontTitle: string | null;
  backTitle: string | null;
  identityKey: string | null;
  identityNumber: string | null;
};

export function LeaderForm({
  leader,
  identityTypes,
}: {
  leader: LeaderData | null;
  identityTypes: IdentityType[];
}) {
  const [state, formAction, pending] = useActionState<SettingsResult | null, FormData>(
    saveLeaderAction,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const preview = formatFullName(leader?.frontTitle, leader?.fullName, leader?.backTitle);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="leader-front">Gelar Depan</Label>
          <Input id="leader-front" name="frontTitle" maxLength={30} defaultValue={leader?.frontTitle ?? ""} placeholder="Drs." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leader-name">Nama Pimpinan</Label>
          <Input id="leader-name" name="fullName" minLength={2} maxLength={120} defaultValue={leader?.fullName ?? ""} placeholder="Ahmad Fauzi" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="leader-back">Gelar Belakang</Label>
        <Input id="leader-back" name="backTitle" maxLength={30} defaultValue={leader?.backTitle ?? ""} placeholder="M.Pd." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="leader-identity">Jenis Identitas</Label>
          <Select name="identityKey" defaultValue={leader?.identityKey ?? ""}>
            <SelectTrigger id="leader-identity" className="w-full">
              <SelectValue placeholder={identityTypes.length ? "Pilih identitas" : "Belum ada jenis identitas"} />
            </SelectTrigger>
            <SelectContent>
              {identityTypes.length === 0 && (
                <SelectItem value="none" disabled>
                  Atur di tab Identitas Lembaga
                </SelectItem>
              )}
              {identityTypes.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leader-identity-number">Nomor Identitas</Label>
          <Input id="leader-identity-number" name="identityNumber" maxLength={40} defaultValue={leader?.identityNumber ?? ""} placeholder="1234567" />
        </div>
      </div>

      <div className="rounded-xl bg-role-soft/60 px-4 py-3 text-sm text-role-strong ring-1 ring-role/20">
        <span className="font-medium">Pratinjau dokumen: </span>
        {preview}
        {leader?.identityNumber && leader?.identityKey && (
          <span className="text-muted-foreground">
            {" "}
            · {identityTypes.find((t) => t.key === leader.identityKey)?.label ?? leader.identityKey}:{" "}
            {leader.identityNumber}
          </span>
        )}
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending && <Spinner />} Simpan Data Pimpinan
      </Button>
    </form>
  );
}
