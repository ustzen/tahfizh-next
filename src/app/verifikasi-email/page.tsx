import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VerificationResendButton } from "./resend-button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Verifikasi Email" };

/**
 * Rule #2: users with an unverified email cannot use features that require a
 * verified account. This page explains the state and offers a resend button.
 */
export default async function VerifikasiEmailPage() {
  const profile = await requireRole(
    ["DEVELOPER", "ADMIN", "KOORDINATOR", "USTADZ", "WALI_SANTRI"],
    "/verifikasi-email"
  );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const verified = Boolean(user?.email_confirmed_at ?? user?.confirmed_at);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="shadow-card w-full max-w-md rounded-2xl">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="bg-gradient-brand flex size-14 items-center justify-center rounded-2xl text-white">
            <MailCheck className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {verified ? "Email Terverifikasi" : "Verifikasi Email Anda"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {verified
                ? "Email Anda sudah terverifikasi. Anda dapat melanjutkan menggunakan TAHFIZH — termasuk login via Google dengan email yang terhubung ke akun ini."
                : `Kami telah mengirim link verifikasi ke ${profile.email}. Buka tautan tersebut untuk mengaktifkan fitur lengkap akun Anda, termasuk Google Login.`}
            </p>
          </div>

          {!verified && <VerificationResendButton />}

          <Link
            href={profile.role === "DEVELOPER" ? "/developer" : `/${profile.role.toLowerCase()}`}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            ← Kembali ke Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
