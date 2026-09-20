"use client";

import { useActionState, useMemo, useState } from "react";
import { KeyRound, Search } from "lucide-react";

import { adminForceResetPasswordAction, type AkunResult } from "@/app/actions/akun";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { roleLabel } from "@/lib/roles";

/**
 * TAHFIZH V12.4 — Reset paksa password akun oleh ADMIN lembaga.
 *
 * Admin memilih akun SANTRI / GURU / KOORDINATOR lembaganya lalu menetapkan
 * password baru. Pemilik akun wajib mengganti password pada login berikutnya
 * (must_change_password). Pemilihan akun difilter per nama/username agar
 * tetap nyaman di lembaga besar; ID internal tidak pernah ditampilkan.
 */

export type ResettableAccount = {
  id: string;
  full_name: string;
  role: "WALI_SANTRI" | "USTADZ" | "KOORDINATOR";
  username: string | null;
};

export function AdminForceResetCard({ accounts }: { accounts: ResettableAccount[] }) {
  const [state, formAction, pending] = useActionState<AkunResult | null, FormData>(
    adminForceResetPasswordAction as never,
    null
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) ||
        (a.username ?? "").toLowerCase().includes(q)
    );
  }, [accounts, query]);

  const selectedAccount = accounts.find((a) => a.id === selected) ?? null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="profileId" value={selected} />

      <div className="space-y-1.5">
        <Label htmlFor="reset-search">Cari akun (nama atau username)</Label>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            id="reset-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="mis. Zain / zain"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-account">Akun yang direset</Label>
        <Select name="accountPicker" value={selected} onValueChange={setSelected} required>
          <SelectTrigger id="reset-account" className="w-full">
            <SelectValue placeholder={filtered.length ? "Pilih akun…" : "Tidak ada akun ditemukan"} />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {filtered.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name} — {roleLabel(a.role)}
                {a.username ? ` (${a.username})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Santri, Guru, dan Koordinator lembaga Anda. Akun Admin lain dan Developer tidak
          dapat direset dari sini.
        </p>
      </div>

      {selectedAccount && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">Password Baru</Label>
            <PasswordInput
              id="reset-password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Konfirmasi Password</Label>
            <PasswordInput
              id="reset-confirm"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Ulangi password baru"
            />
          </div>
        </div>
      )}

      {state?.error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-300" role="alert">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300" role="status">{state.success}</p>
      )}

      <Button
        type="submit"
        disabled={pending || !selectedAccount}
        variant="destructive"
        className="w-full sm:w-auto"
      >
        {pending ? (
          <>
            <Spinner /> Mereset…
          </>
        ) : (
          <>
            <KeyRound className="size-4" /> Reset Password Akun Terpilih
          </>
        )}
      </Button>
    </form>
  );
}
