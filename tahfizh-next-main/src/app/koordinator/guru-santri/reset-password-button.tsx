"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

import { adminResetPasswordByPersonAction, type AkunResult } from "@/app/actions/akun";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

/**
 * TAHFIZH V12.5 — Reset Sandi langsung dari form Edit Guru / Edit Santri
 * (menu Data Guru / Data Santri). Tombol Reset Sandi ada di bagian paling
 * bawah form edit. Verifikasi & keamanan sama dengan kartu Reset Password
 * di Pengaturan → Keamanan: hanya Admin lembaga, satu tenant, password
 * di-hash Supabase Auth, wajib ganti password saat login berikutnya.
 */
export function ResetPasswordButton({
  kind,
  personId,
  name,
  hasAccount,
}: {
  kind: "teacher" | "student";
  personId: string;
  name: string;
  hasAccount: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AkunResult | null, FormData>(
    adminResetPasswordByPersonAction as never,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setOpen(false);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="text-amber-700 dark:text-amber-300 hover:bg-amber-50 hover:text-amber-800">
          <KeyRound className="size-4" /> Reset Sandi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Sandi {kind === "teacher" ? "Guru" : "Santri"}</DialogTitle>
          <DialogDescription>
            {hasAccount
              ? `Tetapkan password baru untuk akun ${name}. Pemilik akun wajib mengganti password pada login berikutnya.`
              : `${name} belum memiliki akun login (belum ada username). Tambahkan username pada saat menambah santri/guru, atau reset lewat Pengaturan → Keamanan setelah akun dibuat.`}
          </DialogDescription>
        </DialogHeader>

        {hasAccount ? (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="personId" value={personId} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`reset-pw-${kind}-${personId}`}>Password Baru</Label>
                <PasswordInput
                  id={`reset-pw-${kind}-${personId}`}
                  name="newPassword"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`reset-pw2-${kind}-${personId}`}>Konfirmasi Password</Label>
                <PasswordInput
                  id={`reset-pw2-${kind}-${personId}`}
                  name="confirmPassword"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Ulangi password baru"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={pending} variant="destructive">
                {pending && <Spinner />} Reset Sandi
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
