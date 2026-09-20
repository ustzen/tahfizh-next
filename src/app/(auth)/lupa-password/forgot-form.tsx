"use client";

import { useActionState, useState } from "react";
import { KeyRound, MessageSquareText } from "lucide-react";

import {
  completeAccountResetAction,
  requestAccountResetAction,
  requestPasswordResetAction,
  type PasswordResult,
} from "@/app/actions/password";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { cn } from "@/lib/utils";

/**
 * Lupa Password — dua jalur:
 *  1. EMAIL  : akun dengan email asli (Koordinator/Admin) menerima link reset.
 *  2. USERNAME: akun Santri/Guru (email sintetis, tidak menerima email)
 *     mengajukan permintaan ke Admin lembaga; Admin menyetujui lalu memberikan
 *     kode sekali-pakai via WhatsApp. Kode + password baru ditukar di sini.
 */
const TABS = [
  { key: "email", label: "via Email" },
  { key: "username", label: "via Username" },
] as const;

export function ForgotForm() {
  const [tab, setTab] = useState<"email" | "username">("email");
  const [stage, setStage] = useState<"request" | "complete">("request");
  const [username, setUsername] = useState("");

  const [emailState, emailAction, emailPending] = useActionState(
    requestPasswordResetAction,
    null as PasswordResult | null
  );
  const [reqState, reqAction, reqPending] = useActionState(
    requestAccountResetAction,
    null as PasswordResult | null
  );
  const [cmpState, cmpAction, cmpPending] = useActionState(
    completeAccountResetAction,
    null as PasswordResult | null
  );

  const state = tab === "email" ? emailState : stage === "request" ? reqState : cmpState;
  const done = state?.success;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "email" ? (
        <form action={emailAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="nama@email.com"
            />
          </div>

          {emailState?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{emailState.error}</p>
          )}
          {emailState?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{emailState.success}</p>
          )}

          <Button type="submit" disabled={emailPending} className="bg-gradient-brand w-full hover:opacity-90">
            {emailPending && <Spinner />} KIRIM LINK RESET
          </Button>

          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            Jika email terdaftar, Anda akan menerima link untuk membuat password baru. Link kedaluwarsa?
            Ajukan permintaan baru di halaman ini.
          </p>
        </form>
      ) : stage === "request" ? (
        <form action={reqAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username akun Anda"
            />
          </div>

          {reqState?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{reqState.error}</p>
          )}
          {reqState?.success && (
            <div className="space-y-3">
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{reqState.success}</p>
              <Button type="button" variant="outline" className="w-full" onClick={() => setStage("complete")}>
                <KeyRound className="size-4" /> SUDAH PUNYA KODE — LANJUT GANTI PASSWORD
              </Button>
            </div>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            Untuk akun Santri/Guru yang login dengan username: permintaan Anda diteruskan ke Admin
            lembaga. Setelah disetujui, Admin akan mengirim <strong>kode reset</strong> ke WhatsApp
            Anda. Masukkan kode tersebut bersama password baru.
          </p>

          <Button type="submit" disabled={reqPending} className="bg-gradient-brand w-full hover:opacity-90">
            {reqPending && <Spinner />} KIRIM PERMINTAAN KE ADMIN
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-blue-700 hover:underline"
            onClick={() => setStage("complete")}
          >
            Sudah punya kode dari Admin? →
          </button>
        </form>
      ) : (
        <form action={cmpAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-username">Username</Label>
            <Input id="c-username" name="username" required value={username} readOnly className="bg-slate-50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">Kode Reset dari Admin</Label>
            <Input
              id="code"
              name="code"
              required
              className="text-center font-mono text-lg tracking-[0.3em] uppercase"
              maxLength={8}
              placeholder="XXXXXXXX"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-password">Password Baru</Label>
              <PasswordInput id="c-password" name="password" required minLength={8} autoComplete="new-password" placeholder="Minimal 8 karakter" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-confirm">Konfirmasi Password</Label>
              <PasswordInput id="c-confirm" name="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="Ulangi password baru" />
            </div>
          </div>

          {cmpState?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{cmpState.error}</p>
          )}
          {cmpState?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{cmpState.success}</p>
          )}

          <Button type="submit" disabled={cmpPending} className="bg-gradient-brand w-full hover:opacity-90">
            {cmpPending && <Spinner />} SIMPAN PASSWORD BARU
          </Button>
          {cmpState?.success && (
            <Button type="button" variant="outline" className="w-full" onClick={() => window.location.assign("/masuk")}>
              <MessageSquareText className="size-4" /> Ke Halaman Login
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
