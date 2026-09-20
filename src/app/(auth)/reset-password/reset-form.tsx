"use client";

import { useActionState } from "react";

import { updatePasswordAction } from "@/app/actions/password";
import { PasswordInput } from "@/components/password-input";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ResetForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">Password Baru</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Ulangi password baru"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {state.success}
        </p>
      )}

      <Button type="submit" disabled={pending} className="bg-gradient-brand w-full hover:opacity-90">
        {pending && <Spinner />} SIMPAN PASSWORD BARU
      </Button>

      {state?.success && (
        <p className="text-muted-foreground text-center text-xs">
          <a href="/masuk" className="font-semibold text-blue-700 hover:underline">
            Masuk dengan password baru →
          </a>
        </p>
      )}
    </form>
  );
}
