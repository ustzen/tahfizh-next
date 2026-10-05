"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Landmark, Lock, User } from "lucide-react";

import { loginAction } from "@/app/actions/auth";
import { GoogleLoginButton } from "@/components/landing/google-login-button";
import { Spinner } from "@/components/loading";

/* ------------------------------------------------------------------ */
/* Logo buku terbuka + tunas hijau (sesuai mockup)                     */
/* ------------------------------------------------------------------ */
function BookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 60" className={className} aria-hidden>
      {/* tunas */}
      <path d="M32 2c-5 1.5-8.5 5-9.5 10 5 .5 8.5-2 9.5-6 1 4 4.5 6.5 9.5 6-1-5-4.5-8.5-9.5-10Z" fill="#22C55E" />
      <path d="M32 10v10" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
      {/* halaman kiri (biru) */}
      <path d="M30 24C22 18.5 12 17.5 4 20.5V46c8-3 18-2 26 3.5V24Z" fill="#1D6FBF" />
      {/* halaman kanan (oranye) */}
      <path d="M34 24c8-5.5 18-6.5 26-3.5V46c-8-3-18-2-26 3.5V24Z" fill="#F59E0B" />
      {/* punggung buku */}
      <path d="M30 24h4v25.5h-4z" fill="#0B4A7A" opacity="0.35" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Ilustrasi masjid flat (dekoratif)                                   */
/* ------------------------------------------------------------------ */
function MosqueScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 110" className={className} aria-hidden>
      {/* pepohonan */}
      <circle cx="28" cy="92" r="24" fill="#57A64B" />
      <circle cx="60" cy="100" r="17" fill="#3F8F3F" />
      <circle cx="374" cy="94" r="22" fill="#57A64B" />
      <circle cx="342" cy="102" r="15" fill="#3F8F3F" />

      {/* menara kiri */}
      <rect x="104" y="46" width="13" height="58" rx="3" fill="#EFDDB6" />
      <rect x="100" y="60" width="21" height="7" rx="2" fill="#E3C892" />
      <path d="M104 46c0-8 3-13 6.5-13s6.5 5 6.5 13Z" fill="#2E86D9" />

      {/* bangunan utama */}
      <rect x="132" y="64" width="136" height="40" rx="4" fill="#EFDDB6" />
      <rect x="132" y="94" width="136" height="10" fill="#E3C892" />
      {/* kubah utama */}
      <path d="M172 64c0-20 12-32 28-32s28 12 28 32Z" fill="#2E86D9" />
      <path d="M200 32v-8" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      {/* pintu lengkung */}
      <path d="M192 104V88c0-5 3.5-8 8-8s8 3 8 8v16Z" fill="#1D5FAA" />
      {/* kubah kecil kiri-kanan */}
      <path d="M140 64c0-11 6-17 12-17s12 6 12 17Z" fill="#F2A33C" />
      <path d="M236 64c0-11 6-17 12-17s12 6 12 17Z" fill="#F2A33C" />

      {/* menara kanan */}
      <rect x="284" y="34" width="14" height="70" rx="3" fill="#EFDDB6" />
      <rect x="280" y="52" width="22" height="7" rx="2" fill="#E3C892" />
      <path d="M284 34c0-9 3.5-14 7-14s7 5 7 14Z" fill="#2E86D9" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Wave biru + oranye (pembatas ilustrasi → form, dan kaki kartu)      */
/* ------------------------------------------------------------------ */
function WaveDivider({ className, flipped = false }: { className?: string; flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 400 90"
      preserveAspectRatio="none"
      aria-hidden
      className={`${className ?? ""} ${flipped ? "rotate-180" : ""}`}
    >
      <path d="M0 38C80 10 170 62 250 46 320 32 365 38 400 20V90H0Z" fill="#2E86D9" />
      <path d="M0 56C80 30 170 78 250 62 320 48 365 54 400 38V90H0Z" fill="#F59E0B" />
      <path d="M0 74C90 50 200 96 400 58V90H0Z" fill="#ffffff" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Layar login — desain persis mockup                                  */
/* ------------------------------------------------------------------ */
export function LoginScreen({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative w-full max-w-[420px] overflow-hidden rounded-[2.5rem] border-[10px] border-white bg-white shadow-xl shadow-sky-900/15">
      {/* ============ ILUSTRASI ATAS ============ */}
      <div className="relative bg-gradient-to-b from-sky-400 via-sky-300 to-sky-200">
        {/* awan */}
        <div aria-hidden className="absolute inset-0">
          <div className="absolute left-3 top-5 h-9 w-24 rounded-full bg-white/75 blur-[2px]" />
          <div className="absolute right-4 top-3 h-8 w-20 rounded-full bg-white/60 blur-[2px]" />
          <div className="absolute left-1/3 top-14 h-7 w-16 rounded-full bg-white/50 blur-[2px]" />
        </div>

        {/* logo + judul */}
        <div className="relative flex flex-col items-center px-6 pt-9">
          <BookLogo className="size-16" />
          <p className="mt-1.5 text-4xl font-extrabold tracking-tight text-[#1D5FAA]">TAHFIZH</p>
          <p className="mt-0.5 text-sm font-medium text-slate-700">Sahabat Menghafal Al-Qur&apos;an</p>
        </div>

        <MosqueScene className="relative mt-1 h-24 w-full" />
        <WaveDivider className="relative -mt-px h-14 w-full sm:h-16" />
      </div>

      {/* ============ FORM ============ */}
      <div className="bg-white px-7 pb-9 pt-1">
        <h1 className="text-center text-4xl font-extrabold text-[#1D5FAA]">Login</h1>
        <p className="mt-2 text-center text-[0.95rem] leading-snug text-slate-500">
          Masuk ke akun lembaga Anda
          <br />
          untuk melanjutkan
        </p>

        {(state?.error || notice) && (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {state?.error ?? notice}
          </p>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          {/* Username / Email */}
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 fill-slate-700 text-slate-700" />
            <input
              id="login-username"
              name="username"
              type="text"
              inputMode="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Username / Email"
              className="h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-100 pl-12 pr-4 text-[0.95rem] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 fill-slate-700 text-slate-700" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Password"
              className="h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-100 pl-12 pr-12 text-[0.95rem] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition-colors hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>

          {/* Ingat saya */}
          <label className="flex cursor-pointer select-none items-center gap-2.5">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="size-5 rounded-md accent-[#2563EB]"
            />
            <span className="text-[0.95rem] font-semibold text-slate-700">Ingat saya</span>
          </label>

          {/* Tombol Login */}
          <button
            type="submit"
            disabled={pending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-500 to-orange-500 text-lg font-bold text-white shadow-lg shadow-orange-500/30 transition hover:brightness-105 disabled:opacity-60"
          >
            {pending ? <Spinner /> : (<>
              Login
              <ArrowRight className="size-5" />
            </>)}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/lupa-password" className="text-[0.95rem] font-semibold text-[#2563EB] hover:underline">
            Lupa password?
          </Link>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          atau
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <GoogleLoginButton />

        {/* Daftar lembaga */}
        <Link
          href="/daftar"
          className="mt-5 flex items-center gap-3.5 rounded-2xl bg-blue-50 px-5 py-4 transition hover:bg-blue-100"
        >
          <Landmark className="size-8 shrink-0 text-[#2563EB]" />
          <span>
            <span className="block text-[0.95rem] font-medium text-slate-700">Belum punya akun ?</span>
            <span className="flex items-center gap-1.5 text-[0.95rem] font-bold text-[#2563EB]">
              Daftarkan lembaga anda
              <ArrowRight className="size-4" />
            </span>
          </span>
        </Link>
      </div>

      {/* ============ WAVE BAWAH ============ */}
      <WaveDivider flipped className="-mt-px block h-14 w-full sm:h-16" />
    </div>
  );
}
