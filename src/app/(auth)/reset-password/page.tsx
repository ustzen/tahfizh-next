import type { Metadata } from "next";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset Password" };

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buat Password Baru</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Password baru akan menggantikan password lama Anda.
      </p>
      <ResetForm />
    </div>
  );
}
