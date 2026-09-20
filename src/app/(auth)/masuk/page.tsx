import type { Metadata } from "next";

import { LoginFormCard } from "@/components/landing/login-form-card";

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
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Selamat datang kembali</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Masuk untuk melanjutkan ke dashboard TAHFIZH Anda.
      </p>
      <div className="mt-6">
        <LoginFormCard className="border shadow-card" notice={error ? NOTICES[error] : undefined} />
      </div>
    </div>
  );
}
