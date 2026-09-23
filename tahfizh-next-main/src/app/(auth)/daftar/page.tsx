import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar Lembaga" };

export default function DaftarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Daftarkan Lembaga Anda</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Gratis untuk sekolah, TPQ, rumah tahfizh, madrasah, dan lembaga Al-Qur&apos;an.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        Sudah punya akun?{" "}
        <Link href="/masuk" className="font-semibold text-blue-700 hover:underline">
          Login
        </Link>
      </p>
    </div>
  );
}
