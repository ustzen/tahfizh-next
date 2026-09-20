import Link from "next/link";
import { HeartHandshake } from "lucide-react";

import { Logo } from "@/components/logo";

const FOOTER_SECTIONS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "/#fitur" },
      { label: "Cara Kerja", href: "/#cara-kerja" },
      { label: "Keamanan Data", href: "/#keamanan" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Akses",
    links: [
      { label: "Login", href: "/masuk" },
      { label: "Daftar Lembaga", href: "/daftar" },
      { label: "Lupa Password", href: "/lupa-password" },
    ],
  },
  {
    title: "Untuk Lembaga",
    links: [
      { label: "Sekolah", href: "/#target" },
      { label: "TPQ", href: "/#target" },
      { label: "Rumah Tahfizh", href: "/#target" },
      { label: "Madrasah", href: "/#target" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 pb-10 pt-14 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            Platform pengelolaan tahfizh untuk sekolah, TPQ, rumah tahfizh, madrasah, dan lembaga
            Al-Qur&apos;an. Gratis untuk lembaga — didukung infak pengembangan sukarela.
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            <HeartHandshake className="size-3.5 text-yellow-400" />
            Infak pengembangan mulai Rp1.000/bulan
          </p>
        </div>
        {FOOTER_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-sm font-semibold text-white">{section.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {section.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-slate-400 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-4 pt-6 text-xs text-slate-500 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} TAHFIZH. Dibangun untuk umat.</p>
        <p>Keamanan data santri adalah prioritas utama kami.</p>
      </div>
    </footer>
  );
}
