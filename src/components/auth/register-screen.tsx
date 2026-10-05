"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BookOpenText,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  Mail,
  Phone,
  Sprout,
  User,
  Users,
} from "lucide-react";

import { registerLembagaAction } from "@/app/actions/register";
import { Spinner } from "@/components/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TENANT_KINDS } from "@/lib/roles";

/* ------------------------------------------------------------------ */
/* Logo buku terbuka + tunas hijau (bawaan — diganti bila Developer    */
/* mengunggah logo sendiri)                                            */
/* ------------------------------------------------------------------ */
function BookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 60" className={className} aria-hidden>
      <path d="M32 2c-5 1.5-8.5 5-9.5 10 5 .5 8.5-2 9.5-6 1 4 4.5 6.5 9.5 6-1-5-4.5-8.5-9.5-10Z" fill="#22C55E" />
      <path d="M32 10v10" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 24C22 18.5 12 17.5 4 20.5V46c8-3 18-2 26 3.5V24Z" fill="#1D6FBF" />
      <path d="M34 24c8-5.5 18-6.5 26-3.5V46c-8-3-18-2-26 3.5V24Z" fill="#F59E0B" />
      <path d="M30 24h4v25.5h-4z" fill="#0B4A7A" opacity="0.35" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Logo + wordmark TAHFIZH                                             */
/* ------------------------------------------------------------------ */
function BrandLockup({
  logoUrl,
  logoClass = "h-14",
  titleClass = "text-5xl",
  taglineClass = "text-sm",
  centered = false,
}: {
  logoUrl: string | null;
  logoClass?: string;
  titleClass?: string;
  taglineClass?: string;
  centered?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 ${centered ? "justify-center" : ""}`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Logo TAHFIZH" className={`${logoClass} w-auto object-contain`} />
      ) : (
        <BookLogo className={logoClass} />
      )}
      <div className={centered ? "text-center" : ""}>
        <p className={`${titleClass} font-extrabold leading-none tracking-tight text-[#1D5FAA]`}>TAHFIZH</p>
        <p className={`${taglineClass} mt-1 font-semibold text-slate-600`}>Sahabat Menghafal Al-Qur&apos;an</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ilustrasi masjid flat (bawaan — diganti bila Developer mengunggah   */
/* gambar hero sendiri)                                                */
/* ------------------------------------------------------------------ */
function MosqueScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 110" className={className} aria-hidden>
      <circle cx="28" cy="92" r="24" fill="#57A64B" />
      <circle cx="60" cy="100" r="17" fill="#3F8F3F" />
      <circle cx="374" cy="94" r="22" fill="#57A64B" />
      <circle cx="342" cy="102" r="15" fill="#3F8F3F" />

      <rect x="104" y="46" width="13" height="58" rx="3" fill="#EFDDB6" />
      <rect x="100" y="60" width="21" height="7" rx="2" fill="#E3C892" />
      <path d="M104 46c0-8 3-13 6.5-13s6.5 5 6.5 13Z" fill="#2E86D9" />

      <rect x="132" y="64" width="136" height="40" rx="4" fill="#EFDDB6" />
      <rect x="132" y="94" width="136" height="10" fill="#E3C892" />
      <path d="M172 64c0-20 12-32 28-32s28 12 28 32Z" fill="#2E86D9" />
      <path d="M200 32v-8" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      <path d="M192 104V88c0-5 3.5-8 8-8s8 3 8 8v16Z" fill="#1D5FAA" />
      <path d="M140 64c0-11 6-17 12-17s12 6 12 17Z" fill="#F2A33C" />
      <path d="M236 64c0-11 6-17 12-17s12 6 12 17Z" fill="#F2A33C" />

      <rect x="284" y="34" width="14" height="70" rx="3" fill="#EFDDB6" />
      <rect x="280" y="52" width="22" height="7" rx="2" fill="#E3C892" />
      <path d="M284 34c0-9 3.5-14 7-14s7 5 7 14Z" fill="#2E86D9" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Wave biru + oranye                                                  */
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
/* Fitur andalan                                                       */
/* ------------------------------------------------------------------ */
const REGISTER_FEATURES = [
  { icon: BookOpen, label: "Tahfidz", tone: "bg-[#2563EB]" },
  { icon: Users, label: "Tartil", tone: "bg-[#22C55E]" },
  { icon: BookOpenText, label: "Hadits", tone: "bg-[#F59E0B]" },
  { icon: Sprout, label: "Doa Harian", tone: "bg-[#2563EB]" },
];

const REGISTER_POINTS = [
  {
    icon: BookOpen,
    tone: "bg-[#2563EB]",
    title: "Kelola Program",
    desc: "Tahfizh, Tartil, Hadits, Doa dan lainnya",
  },
  {
    icon: Users,
    tone: "bg-[#22C55E]",
    title: "Pantau Perkembangan",
    desc: "Santri lebih mudah dan terarah",
  },
  {
    icon: BarChart3,
    tone: "bg-[#F59E0B]",
    title: "Laporan Lengkap",
    desc: "Rekap presensi, hafalan, dan aktivitas",
  },
];

/* ------------------------------------------------------------------ */
/* Field styling selaras layar login                                   */
/* ------------------------------------------------------------------ */
const FIELD_CLS =
  "h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-100 pl-12 pr-4 text-[0.95rem] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.95rem] font-bold text-[#1D5FAA]">
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Layar pendaftaran — desain persis mockup                            */
/* ------------------------------------------------------------------ */
export function RegisterScreen({
  logoUrl,
  heroUrl,
}: {
  logoUrl?: string | null;
  heroUrl?: string | null;
}) {
  const [state, formAction, pending] = useActionState(registerLembagaAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="relative z-10 w-full lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-10">
      {/* ============ PANEL KIRI (desktop) ============ */}
      <div className="relative hidden lg:block">
        <BrandLockup logoUrl={logoUrl ?? null} />

        <h2 className="mt-8 text-3xl font-bold text-[#1D5FAA]">Bergabung Bersama Kami</h2>
        <p className="mt-3 max-w-md text-[1.05rem] leading-relaxed text-slate-600">
          Daftarkan lembaga Anda sekarang dan kelola program tahfizh, tartil, hadits, doa, serta
          pembelajaran Islam dengan lebih mudah dan terstruktur.
        </p>

        <ul className="mt-7 max-w-md space-y-5">
          {REGISTER_POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-3.5">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${p.tone} text-white`}>
                <p.icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold text-[#1D5FAA]">{p.title}</span>
                <span className="block text-[0.95rem] text-slate-600">{p.desc}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Gambar hero (unggahan Developer) atau ilustrasi masjid bawaan */}
        <div className="relative mt-6 max-w-lg">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroUrl} alt="Ilustrasi TAHFIZH" className="w-full object-contain" />
          ) : (
            <MosqueScene className="h-44 w-full" />
          )}
        </div>

        <WaveDivider className="-mt-2 h-16 w-full max-w-lg" />

        <ul className="mt-4 flex max-w-lg items-start justify-between">
          {REGISTER_FEATURES.map((f, i) => (
            <li key={i} className="flex flex-col items-center gap-2">
              <span className={`flex size-12 items-center justify-center rounded-full ${f.tone} text-white`}>
                <f.icon className="size-6" />
              </span>
              <span className="text-sm font-semibold text-[#1D5FAA]">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ============ KARTU PENDAFTARAN ============ */}
      <div className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[2.5rem] border-[10px] border-white bg-white shadow-xl shadow-sky-900/15 lg:max-w-[540px] lg:rounded-3xl lg:border-0 lg:shadow-2xl lg:shadow-sky-900/20">
        {/* Header ilustrasi — khusus mobile */}
        <div className="relative bg-gradient-to-b from-sky-400 via-sky-300 to-sky-200 lg:hidden">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute left-3 top-5 h-9 w-24 rounded-full bg-white/75 blur-[2px]" />
            <div className="absolute right-4 top-3 h-8 w-20 rounded-full bg-white/60 blur-[2px]" />
            <div className="absolute left-1/3 top-14 h-7 w-16 rounded-full bg-white/50 blur-[2px]" />
          </div>

          <div className="relative flex flex-col items-center px-6 pt-9">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo TAHFIZH" className="size-16 object-contain" />
            ) : (
              <BookLogo className="size-16" />
            )}
            <p className="mt-1.5 text-4xl font-extrabold tracking-tight text-[#1D5FAA]">TAHFIZH</p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">Sahabat Menghafal Al-Qur&apos;an</p>
          </div>

          <MosqueScene className="relative mt-1 h-24 w-full" />
          <WaveDivider className="relative -mt-px h-14 w-full" />
        </div>

        {/* Logo di dalam kartu — khusus desktop */}
        <div className="hidden px-9 pt-9 lg:block">
          <BrandLockup logoUrl={logoUrl ?? null} logoClass="h-11" titleClass="text-3xl" taglineClass="text-xs" />
        </div>

        {/* ============ FORM ============ */}
        <div className="bg-white px-7 pb-9 pt-7 lg:px-9 lg:pb-10 lg:pt-6">
          <h1 className="text-center text-3xl font-extrabold text-[#1D5FAA] lg:text-left lg:text-4xl">
            Pendaftaran Lembaga
          </h1>
          <p className="mt-2 text-center text-[0.95rem] text-slate-500 lg:text-left">
            Silakan isi data lembaga Anda dengan lengkap dan benar.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <FieldLabel htmlFor="name">Nama Lembaga</FieldLabel>
              <div className="relative">
                <Landmark className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2563EB]" />
                <input
                  id="name"
                  name="name"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="TPQ Al-Hikmah"
                  className={FIELD_CLS}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="kind">Jenis Lembaga</FieldLabel>
              <div className="relative">
                <Landmark className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-[#2563EB]" />
                <Select name="kind" required defaultValue="TPQ">
                  <SelectTrigger id="kind" className={`${FIELD_CLS} [&>svg]:opacity-100`}>
                    <SelectValue placeholder="Pilih jenis lembaga" />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="fullName">Nama Penanggung Jawab</FieldLabel>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 fill-slate-700 text-slate-700" />
                  <input
                    id="fullName"
                    name="fullName"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Ahmad Fauzi"
                    className={FIELD_CLS}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="whatsapp">Nomor WhatsApp</FieldLabel>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2563EB]" />
                  <input
                    id="whatsapp"
                    name="whatsapp"
                    type="tel"
                    placeholder="081234567890"
                    className={FIELD_CLS}
                  />
                </div>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2563EB]" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="ahmad@example.com"
                  className={FIELD_CLS}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2563EB]" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Minimal 8 karakter"
                    className={`${FIELD_CLS} pr-12`}
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
              </div>
              <div>
                <FieldLabel htmlFor="confirmPassword">Konfirmasi Password</FieldLabel>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2563EB]" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Ulangi password"
                    className={`${FIELD_CLS} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition-colors hover:text-slate-700"
                  >
                    {showConfirm ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>
            </div>

            {state?.error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700">{state.error}</p>
            )}
            {state?.success && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-semibold">{state.success}</p>
                <p className="mt-1 text-xs text-blue-700">
                  Belum menerima email? Periksa folder spam, atau{" "}
                  <a href="/verifikasi-email" className="font-semibold underline">
                    kirim ulang di sini
                  </a>
                  .
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] text-lg font-bold text-white shadow-lg shadow-blue-600/30 transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? <Spinner /> : (<>
                Daftarkan Lembaga
                <ArrowRight className="size-5" />
              </>)}
            </button>

            <p className="text-center text-[0.8rem] leading-relaxed text-slate-500">
              Dengan mendaftar, akun Anda otomatis menjadi <strong className="text-[#2563EB]">Admin</strong> lembaga.
              Pendaftaran gratis, tanpa biaya langganan.
            </p>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[0.95rem] font-semibold text-[#2563EB]">
              Sudah punya akun?{" "}
              <Link href="/masuk" className="font-bold hover:underline">
                Login
              </Link>
            </span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>

        {/* ============ WAVE BAWAH — khusus mobile ============ */}
        <WaveDivider flipped className="-mt-px block h-14 w-full lg:hidden" />
      </div>
    </div>
  );
}
