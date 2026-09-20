"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateProfileAction, type ProfileResult } from "@/app/actions/profile";
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

type ProfileData = {
  fullName: string;
  frontTitle: string | null;
  backTitle: string | null;
  whatsapp: string | null;
  gender: "L" | "P" | null;
  email: string;
  showGender: boolean;
};

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [state, formAction, pending] = useActionState<ProfileResult | null, FormData>(
    updateProfileAction,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="frontTitle">Gelar Depan</Label>
          <Input
            id="frontTitle"
            name="frontTitle"
            maxLength={30}
            defaultValue={profile.frontTitle ?? ""}
            placeholder="Drs. / Ust. / H."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nama Lengkap</Label>
          <Input id="fullName" name="fullName" required minLength={2} maxLength={120} defaultValue={profile.fullName} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="backTitle">Gelar Belakang</Label>
          <Input
            id="backTitle"
            name="backTitle"
            maxLength={30}
            defaultValue={profile.backTitle ?? ""}
            placeholder="M.Pd. / S.Pd.I."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">Nomor WhatsApp</Label>
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            defaultValue={profile.whatsapp ?? ""}
            placeholder="081234567890"
          />
        </div>
      </div>

      {profile.showGender && (
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select name="gender" defaultValue={profile.gender ?? "L"}>
            <SelectTrigger id="gender" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="L">Laki-laki</SelectItem>
              <SelectItem value="P">Perempuan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email-view">Email</Label>
        <Input id="email-view" value={profile.email} disabled className="sm:max-w-md bg-muted/50" />
        <p className="text-muted-foreground text-xs">
          Email diubah pada tab <strong>Keamanan</strong> dengan verifikasi.
        </p>
      </div>

      <div className="rounded-xl bg-role-soft/60 px-4 py-3 text-sm text-role-strong ring-1 ring-role/20">
        <span className="font-medium">Pratinjau tampilan nama: </span>
        {formatFullName(
          (document.getElementById("frontTitle") as HTMLInputElement | null)?.value || profile.frontTitle,
          (document.getElementById("fullName") as HTMLInputElement | null)?.value || profile.fullName,
          (document.getElementById("backTitle") as HTMLInputElement | null)?.value || profile.backTitle
        )}
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending && <Spinner />} Simpan Profil
      </Button>
    </form>
  );
}
