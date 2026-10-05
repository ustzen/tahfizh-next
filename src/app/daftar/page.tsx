import type { Metadata } from "next";

import { RegisterScreen } from "@/components/auth/register-screen";
import { brandingPublicUrl, getLoginBranding } from "@/lib/branding";

export const metadata: Metadata = { title: "Daftar Lembaga" };

// Branding dibaca dari DB per-request (halaman publik anonim; env Supabase
// tidak tersedia saat prerender build).
export const dynamic = "force-dynamic";

export default async function DaftarPage() {
  const branding = await getLoginBranding();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 px-4 py-10 lg:px-10">
      {/* dekorasi langit */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[6%] top-[12%] h-16 w-40 rounded-full bg-white/70 blur-[3px]" />
        <div className="absolute right-[8%] top-[20%] h-14 w-36 rounded-full bg-white/60 blur-[3px]" />
        <div className="absolute bottom-[14%] left-[10%] h-14 w-44 rounded-full bg-white/50 blur-[3px]" />
        <div className="absolute right-[12%] bottom-[8%] h-12 w-36 rounded-full bg-white/45 blur-[3px]" />
      </div>

      <RegisterScreen
        logoUrl={branding.logoPath ? brandingPublicUrl(branding.logoPath) : null}
        heroUrl={branding.heroPath ? brandingPublicUrl(branding.heroPath) : null}
      />
    </main>
  );
}
