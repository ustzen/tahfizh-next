import Link from "next/link";
import {
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Database,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Layers,
  LineChart,
  Lock,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LoginFormCard } from "@/components/landing/login-form-card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Badge variant="outline" className="border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
        {eyebrow}
      </Badge>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">{title}</h2>
      {description && <p className="text-muted-foreground mt-3 text-base leading-relaxed">{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HERO                                                                */
/* ------------------------------------------------------------------ */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-blue-50/70 dark:bg-slate-950">
      {/* decorative gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 size-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute top-40 right-0 size-80 rounded-full bg-yellow-200/60 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-28 pb-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-36 lg:pb-24">
        <div>
          <Badge className="bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300 hover:bg-yellow-100 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/30">
            <HeartHandshake className="size-3.5" />
            GRATIS untuk lembaga — didukung infak pengembangan sukarela
          </Badge>

          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Kelola Tahfizh Lebih Mudah,{" "}
            <span className="text-gradient-brand">Pantau Perkembangan Santri Lebih Terarah.</span>
          </h1>

          <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
            TAHFIZH membantu sekolah, TPQ, dan lembaga Al-Qur&apos;an mengelola pembelajaran dan data
            santri dalam satu platform.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="bg-gradient-brand h-12 px-6 text-base hover:opacity-90">
              <Link href="/daftar">Daftar Lembaga — GRATIS</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <Link href="/masuk">Login</Link>
            </Button>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
            {["Gratis selamanya untuk lembaga", "Data terpisah per lembaga", "Siap mobile"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* LOGIN FORM — langsung terlihat di hero (rule #10) */}
        <div className="relative">
          <div aria-hidden className="absolute -inset-4 rounded-[2rem] bg-yellow-200/50 blur-xl dark:bg-yellow-500/10" />
          <LoginFormCard className="relative" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PREVIEW                                                             */
/* ------------------------------------------------------------------ */
const PREVIEW_ROWS = [
  { id: "S-1", name: "Ahmad Fauzi", progress: 92, tone: "bg-emerald-500" },
  { id: "S-2", name: "Muhammad Rizki", progress: 78, tone: "bg-blue-500" },
  { id: "S-3", name: "Fatimah Azzahra", progress: 85, tone: "bg-sky-500" },
];

export function DashboardPreview() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-card-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-brand flex items-center gap-2 px-5 py-3">
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="ml-3 text-xs font-medium text-white/90">tahfizh.app/admin</span>
        </div>

        <div className="grid md:grid-cols-[220px_1fr]">
          <aside className="hidden border-r p-4 md:block dark:border-slate-800">
            <div className="bg-blue-50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-500/10 dark:text-blue-300">
              <Layers className="size-4" /> Dashboard
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <Users className="size-4" /> Pengguna
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <GraduationCap className="size-4" /> Santri
            </div>
          </aside>

          <div className="p-5 sm:p-7">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Guru", value: "12", icon: BookOpenCheck },
                { label: "Santri", value: "148", icon: GraduationCap },
                { label: "Halaqah", value: "96", icon: Users },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border p-4 dark:border-slate-800">
                  <s.icon className="size-4 text-blue-600 dark:text-blue-400" />
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                  <p className="text-muted-foreground text-xs">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border p-4 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Perkembangan Hafalan (ilustrasi)</p>
              {PREVIEW_ROWS.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-10 text-xs font-medium">{r.id}</span>
                  <span className="w-36 truncate text-sm text-slate-700">{r.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${r.tone}`} style={{ width: `${r.progress}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-semibold text-slate-700">{r.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FITUR                                                               */
/* ------------------------------------------------------------------ */
const FEATURES: { icon: LucideIcon; title: string; desc: string; tone: string }[] = [
  {
    icon: Building2,
    title: "Multi-Lembaga",
    desc: "Setiap sekolah & TPQ punya ruang datanya sendiri. Data antar lembaga terpisah total di tingkat database.",
    tone: "bg-blue-100 text-blue-700",
  },
  {
    icon: UserCog,
    title: "5 Role Siap Pakai",
    desc: "Developer, Admin, Koordinator, Ustadz/Ustadzah, dan Santri — dengan hak akses masing-masing.",
    tone: "bg-violet-100 text-violet-700",
  },
  {
    icon: Users,
    title: "Manajemen Pengguna",
    desc: "Admin menambah koordinator, ustadz, dan santri dalam hitungan detik.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: BookOpenCheck,
    title: "Data Guru & Santri",
    desc: "ID otomatis (A-1, S-1, …), status aktif/nonaktif, dan relasi guru–santri yang rapi.",
    tone: "bg-amber-100 text-amber-700",
  },
  {
    icon: Smartphone,
    title: "Ramah Mobile",
    desc: "Dashboard ringan dan responsif — cek data dari HP kapan saja tanpa aplikasi tambahan.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Zap,
    title: "Cepat & Instan",
    desc: "Navigasi terasa seperti pindah tab: sidebar tetap, konten langsung berganti.",
    tone: "bg-orange-100 text-orange-700",
  },
];

export function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
      <SectionHeading
        eyebrow="Fitur"
        title="Semua yang V1 butuhkan — tidak lebih, tidak kurang"
        description="Fondasi yang benar: multi-tenant, role, dan data inti. Fitur akademik lanjutan menyusul di versi berikutnya."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="shadow-card group rounded-2xl border-slate-200/80 transition-all hover:-translate-y-0.5 hover:shadow-card-lg dark:border-slate-800">
            <CardContent className="px-6">
              <span className={`inline-flex size-11 items-center justify-center rounded-xl ${f.tone}`}>
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* TARGET PENGGUNA                                                     */
/* ------------------------------------------------------------------ */
const TARGETS = [
  "Sekolah", "TPQ", "Rumah Tahfizh", "Madrasah", "Lembaga Al-Qur'an", "Lainnya",
];

export function TargetUsers() {
  return (
    <section id="target" className="scroll-mt-20 bg-slate-50 py-24 dark:bg-slate-900/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Target Pengguna"
          title="Dibangun untuk semua lembaga Al-Qur'an"
          description="Dari TPQ neighborhood hingga sekolah formal — satu platform untuk seluruh ekosistem tahfizh."
        />
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {TARGETS.map((t, i) => (
            <span
              key={t}
              className="shadow-card inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Building2 className="size-4 text-blue-600 dark:text-yellow-400" />
              {t}
              {i === 0 && <Badge className="bg-gradient-brand border-0 text-[0.65rem] text-white">Paling umum</Badge>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CARA KERJA                                                          */
/* ------------------------------------------------------------------ */
const STEPS = [
  {
    icon: Building2,
    title: "Daftarkan lembaga",
    desc: "Isi nama lembaga, jenis, dan akun admin. Pendaftaran gratis — ID lembaga (T-101, T-102, …) dibuat otomatis.",
  },
  {
    icon: UserCog,
    title: "Bangun tim & data",
    desc: "Admin menambah koordinator, ustadz/ustadzah, dan santri. Koordinator mengelola data guru & santri.",
  },
  {
    icon: LineChart,
    title: "Pantau perkembangan",
    desc: "Setiap role melihat dashboard-nya: koordinator memantau santri, guru melihat santri binaan, admin memantau keseluruhan.",
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <SectionHeading
        eyebrow="Cara Kerja"
        title="Tiga langkah, langsung jalan"
        description="Tanpa instalasi, tanpa biaya. Cukup daftar dan mulai kelola."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative">
            <Card className="shadow-card h-full rounded-2xl border-slate-200/80 dark:border-slate-800">
              <CardContent className="px-6">
                <div className="flex items-center justify-between">
                  <span className="bg-gradient-brand flex size-11 items-center justify-center rounded-xl text-white">
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-5xl font-extrabold text-slate-100 dark:text-slate-800">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{s.desc}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* KEAMANAN + GRATIS                                                   */
/* ------------------------------------------------------------------ */
const SECURITY_POINTS = [
  {
    icon: ShieldCheck,
    title: "Row Level Security",
    desc: "Isolasi data ditegakkan di database — bukan sekadar filter tampilan. Lembaga lain tidak bisa membaca data Anda, bahkan lewat API.",
  },
  {
    icon: KeyRound,
    title: "Autentikasi Terkelola",
    desc: "Password di-hash oleh Supabase Auth. Tidak ada password plaintext yang tersimpan di aplikasi.",
  },
  {
    icon: Database,
    title: "Validasi Server-Side",
    desc: "Semua input divalidasi ulang di server. Role dan tenant selalu diverifikasi dari sumber aman, bukan dari browser.",
  },
  {
    icon: Lock,
    title: "Sesi Aman",
    desc: "Sesi ditangani token httpOnly via Supabase. 'Ingat saya' menggunakan mekanisme sesi resmi — bukan penyimpanan password.",
  },
];

export function SecurityAndFree() {
  return (
    <section id="keamanan" className="scroll-mt-20 bg-slate-950 py-24 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Badge className="bg-blue-500/15 text-blue-300 hover:bg-blue-500/15">
            <ShieldCheck className="size-3.5" /> Keamanan Data
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Keamanan data santri adalah{" "}
            <span className="text-blue-600 dark:text-blue-400">
              prioritas utama
            </span>
          </h2>
          <p className="mt-4 leading-relaxed text-slate-400">
            Kami mengunci data di lapisan paling bawah. Setiap permintaan diverifikasi per baris di
            database, sehingga lembaga T-101 tidak akan pernah melihat data T-102.
          </p>

          <div className="mt-8 space-y-5">
            {SECURITY_POINTS.map((p) => (
              <div key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-sky-300 ring-1 ring-white/10">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRATIS card */}
        <div className="relative">
          <div aria-hidden className="absolute -inset-3 rounded-[2rem] bg-yellow-400/15 blur-2xl" />
          <div className="relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
            <Badge className="bg-amber-400/15 text-amber-300 hover:bg-amber-400/15">
              <HeartHandshake className="size-3.5" /> Model Bisnis Transparan
            </Badge>
            <p className="mt-5 text-sm font-medium tracking-wide text-slate-300 uppercase">Gratis untuk lembaga</p>
            <p className="mt-2 text-5xl font-extrabold tracking-tight">
              Rp0<span className="text-2xl text-slate-400">/bulan</span>
            </p>
            <p className="mt-4 leading-relaxed text-slate-400">
              Tidak ada biaya langganan untuk sekolah, TPQ, dan lembaga. Platform dikembangkan melalui{" "}
              <span className="font-semibold text-amber-300">infak pengembangan</span> sukarela —
              mulai dari Rp1.000 per bulan, sukarela.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {[
                "Pendaftaran lembaga gratis selamanya",
                "Tanpa modul pembayaran pada V1",
                "Fokus pada kemudahan lembaga, bukan profit",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="size-4 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 w-full bg-white text-slate-900 hover:bg-slate-200">
              <Link href="/daftar">Daftarkan Lembaga Anda</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */
const FAQS = [
  {
    q: "Apakah benar gratis untuk lembaga?",
    a: "Ya. Pendaftaran dan seluruh fitur V1 gratis untuk sekolah, TPQ, rumah tahfizh, madrasah, dan lembaga Al-Qur'an. Pengembangan platform didukung infak sukarela mulai Rp1.000 per bulan.",
  },
  {
    q: "Apakah data lembaga kami aman dari lembaga lain?",
    a: "Aman. TAHFIZH memakai multi-tenant isolation dengan Row Level Security di tingkat database. Setiap kueri otomatis dibatasi hanya ke data lembaga Anda.",
  },
  {
    q: "Siapa saja yang bisa mengakses data santri?",
    a: "Hanya peran yang berhak di lembaga Anda: admin, koordinator, dan ustadz/ustadzah yang membina santri tersebut.",
  },
  {
    q: "Bagaimana cara mendaftarkan lembaga?",
    a: "Klik 'Daftar Lembaga — GRATIS', isi nama lembaga, jenis, dan data penanggung jawab. Akun Anda otomatis menjadi Admin lembaga dan langsung bisa masuk ke dashboard.",
  },
  {
    q: "Apa saja fitur V1?",
    a: "Fondasi: multi-tenant, data guru & santri, halaqah, relasi guru–santri, dan dashboard per role. Fitur setoran hafalan, target, dan raport menyusul di versi berikutnya.",
  },
  {
    q: "Apakah bisa diakses dari HP?",
    a: "Bisa. Seluruh antarmuka dirancang responsif dan ringan, dengan navigasi yang cepat di jaringan mobile.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
      <SectionHeading
        eyebrow="FAQ"
        title="Pertanyaan yang sering diajukan"
        description="Belum menemukan jawaban? Hubungi pengelola lembaga Anda atau tim TAHFIZH."
      />
      <Accordion type="single" collapsible className="mt-10">
        {FAQS.map((f, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left text-base font-medium">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FINAL CTA                                                           */
/* ------------------------------------------------------------------ */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="bg-gradient-brand relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white">
        <div aria-hidden className="absolute inset-0 opacity-30">
          <div className="absolute -top-20 left-1/4 size-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute right-1/4 -bottom-24 size-72 rounded-full bg-sky-300/20 blur-3xl" />
        </div>
        <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
          Siap mengelola tahfizh dengan lebih terarah?
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-blue-100">
          Daftarkan lembaga Anda sekarang — gratis, tanpa kartu kredit, langsung dapat dashboard admin.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-12 bg-white px-7 text-base text-slate-900 hover:bg-slate-100">
            <Link href="/daftar">Daftar Lembaga — GRATIS</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 border-white/40 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white">
            <Link href="/masuk">Login</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
