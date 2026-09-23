import Link from "next/link";
import { BadgeCheck, Building2, ShieldCheck, Sparkles } from "lucide-react";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left brand panel — hidden on mobile */}
      <div className="bg-gradient-brand relative hidden flex-col justify-between p-10 text-white lg:flex">
        <div aria-hidden className="absolute inset-0 opacity-40">
          <div className="absolute -top-24 left-1/3 size-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-0 bottom-0 size-96 rounded-full bg-sky-300/10 blur-3xl" />
        </div>
        <Link href="/" className="relative">
          <Logo dark />
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold tracking-tight">
            Kelola Tahfizh Lebih Mudah, Pantau Perkembangan Santri Lebih Terarah.
          </h1>
          <ul className="mt-8 space-y-4 text-sm text-blue-100">
            {[
              { icon: Building2, text: "Multi-tenant — data lembaga Anda terpisah total dari lembaga lain" },
              { icon: ShieldCheck, text: "Row Level Security menjaga data santri di tingkat database" },
              { icon: BadgeCheck, text: "Gratis untuk lembaga, didukung infak pengembangan" },
            ].map((i) => (
              <li key={i.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <i.icon className="size-4" />
                </span>
                {i.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-blue-200">
          <Sparkles className="size-3.5" /> TAHFIZH V1 — fondasi platform pengelolaan tahfizh
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col">
        <div className="p-6 lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
