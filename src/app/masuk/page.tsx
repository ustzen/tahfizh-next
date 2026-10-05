import type { Metadata } from "next";

import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = { title: "Masuk" };

const NOTICES: Record<string, string> = {
  google_unregistered:
    "Email Google tersebut belum terdaftar. Login Google hanya untuk email yang sudah terdaftar di TAHFIZH.",
  google_unconfirmed: "Email akun ini belum dikonfirmasi. Konfirmasi email Anda terlebih dahulu.",
  google_failed: "Login dengan Google gagal atau dibatalkan. Silakan coba lagi.",
};

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 px-4 py-10">
      {/* dekorasi langit */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[6%] top-[12%] h-16 w-40 rounded-full bg-white/70 blur-[3px]" />
        <div className="absolute right-[8%] top-[20%] h-14 w-36 rounded-full bg-white/60 blur-[3px]" />
        <div className="absolute bottom-[14%] left-[10%] h-14 w-44 rounded-full bg-white/50 blur-[3px]" />
        <div className="absolute right-[12%] bottom-[8%] h-12 w-36 rounded-full bg-white/45 blur-[3px]" />
      </div>

      <LoginScreen notice={error ? NOTICES[error] : undefined} />
    </main>
  );
}
