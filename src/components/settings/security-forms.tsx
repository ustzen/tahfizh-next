"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Mail, KeyRound } from "lucide-react";

import { updateEmailAction, updatePasswordAuthedAction, type ProfileResult } from "@/app/actions/profile";
import { PasswordInput } from "@/components/password-input";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState<ProfileResult | null, FormData>(
    updateEmailAction,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Email Saat Ini</Label>
        <Input value={currentEmail} disabled className="bg-muted/50 sm:max-w-md" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-email">Email Baru</Label>
        <Input id="new-email" name="email" type="email" required placeholder="nama@lembaga.sch.id" className="sm:max-w-md" />
        <p className="text-muted-foreground text-xs">
          Jika konfirmasi diaktifkan, tautan verifikasi akan dikirim ke email baru.
        </p>
      </div>

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner /> : <Mail className="size-4" />} Ubah Email
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ProfileResult | null, FormData>(
    updatePasswordAuthedAction,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      (document.getElementById("pw-form") as HTMLFormElement | null)?.reset();
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form id="pw-form" action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="oldPassword">Password Lama</Label>
        <PasswordInput id="oldPassword" name="oldPassword" autoComplete="current-password" placeholder="Opsional — untuk verifikasi" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Password Baru</Label>
          <PasswordInput id="new-password" name="password" required minLength={8} autoComplete="new-password" placeholder="Minimal 8 karakter" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Konfirmasi Password</Label>
          <PasswordInput id="confirm-password" name="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="Ulangi password baru" />
        </div>
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending ? <Spinner /> : <KeyRound className="size-4" />} Ganti Password
      </Button>
    </form>
  );
}
