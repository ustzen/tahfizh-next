import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="TAHFIZH">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
          <a href="/#fitur" className="transition-colors hover:text-amber-700 dark:hover:text-yellow-400">Fitur</a>
          <a href="/#target" className="transition-colors hover:text-amber-700 dark:hover:text-yellow-400">Target</a>
          <a href="/#cara-kerja" className="transition-colors hover:text-amber-700 dark:hover:text-yellow-400">Cara Kerja</a>
          <a href="/#keamanan" className="transition-colors hover:text-amber-700 dark:hover:text-yellow-400">Keamanan</a>
          <a href="/#faq" className="transition-colors hover:text-amber-700 dark:hover:text-yellow-400">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/masuk">Login</Link>
          </Button>
          <Button asChild className="bg-gradient-brand hover:opacity-90">
            <Link href="/daftar">Daftar Lembaga — GRATIS</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
