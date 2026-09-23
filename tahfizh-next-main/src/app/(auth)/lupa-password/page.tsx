import type { Metadata } from "next";
import Link from "next/link";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Lupa Password" };

export default async function LupaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Lupa Password?</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Login dengan email? Kami kirim link reset ke email Anda. Login dengan username
        (Santri/Guru)? Ajukan permintaan reset — Admin lembaga akan mengirim kode via WhatsApp.
      </p>

      {error === "expired" && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Link reset password tidak valid atau sudah kedaluwarsa. Silakan ajukan permintaan baru.
        </p>
      )}

      <div className="mt-6">
        <ForgotForm />
      </div>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/masuk" className="font-semibold text-blue-700 hover:underline">
          ← Kembali ke Login
        </Link>
      </p>
    </div>
  );
}
