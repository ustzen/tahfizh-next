import Link from "next/link";
import { Compass } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-4 text-center">
      <Logo />
      <div className="mt-8 flex size-16 items-center justify-center rounded-2xl bg-role-soft text-role-strong">
        <Compass className="size-8" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-foreground">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
      </p>
      <Button asChild className="bg-gradient-brand mt-6 hover:opacity-90">
        <Link href="/">Kembali ke Beranda</Link>
      </Button>
    </div>
  );
}
