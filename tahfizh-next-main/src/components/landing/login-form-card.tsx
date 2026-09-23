"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/app/actions/auth";
import { GoogleLoginButton } from "@/components/landing/google-login-button";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/loading";
import { cn } from "@/lib/utils";

export function LoginFormCard({ className, notice }: { className?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <div className={cn("w-full rounded-2xl bg-white p-6 shadow-card-lg sm:p-7 dark:bg-slate-900", className)}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Masuk ke TAHFIZH</h2>
      <p className="text-muted-foreground mt-1 text-sm">Kelola tahfizh lembaga Anda.</p>

      <form action={formAction} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-username">Username/Email</Label>
          {/* type="text" (bukan "email") agar browser tidak menolak username. */}
          <Input
            id="login-username"
            name="username"
            type="text"
            inputMode="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Username atau email"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/lupa-password"
              className="text-xs font-medium text-amber-700 hover:text-amber-600 hover:underline dark:text-yellow-400 dark:hover:text-yellow-300"
            >
              Lupa password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {/* Native checkbox so `remember` is submitted with the form */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-4 rounded border-slate-300 text-blue-600 accent-blue-600"
          />
          Ingat saya
        </label>

        {(state?.error || notice) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state?.error ?? notice}</p>
        )}

        <Button type="submit" disabled={pending} className="bg-gradient-brand w-full hover:opacity-90">
          {pending && <Spinner />}
          MASUK
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        atau
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <GoogleLoginButton />

      <p className="mt-5 border-t pt-4 text-center text-sm text-slate-600">
        Belum punya akun?{" "}
        <Link href="/daftar" className="font-semibold text-blue-700 hover:underline">
          Daftarkan Lembaga Anda
        </Link>
      </p>
    </div>
  );
}
