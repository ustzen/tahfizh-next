"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

import { changeOwnPasswordAction, type AkunResult } from "@/app/actions/akun";
import { PasswordInput } from "@/components/password-input";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * V12 #25 — Wajib ganti password pada login pertama (password sementara
 * dari admin lembaga). Kartu ini tampil di dashboard santri selama
 * profiles.must_change_password masih true.
 */
export function ForceChangePasswordCard() {
  const [state, formAction, pending] = useActionState<AkunResult | null, FormData>(
    changeOwnPasswordAction,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className="shadow-card mb-6 rounded-2xl border-amber-300 dark:border-amber-500/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Ganti Password Sementara Anda</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Akun Anda masih memakai password sementara dari admin. Wajib diganti sebelum
              menggunakan aplikasi.
            </p>
            <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="force-current">Password Sementara</Label>
                <PasswordInput id="force-current" name="currentPassword" required autoComplete="current-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="force-new">Password Baru</Label>
                <PasswordInput id="force-new" name="password" required minLength={8} autoComplete="new-password" placeholder="Minimal 8 karakter" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="force-confirm">Konfirmasi</Label>
                <PasswordInput id="force-confirm" name="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="Ulangi password baru" />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                  {pending && <Spinner />} Simpan Password Baru
                </Button>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
