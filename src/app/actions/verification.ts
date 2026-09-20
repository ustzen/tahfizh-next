"use server";

import { createClient } from "@/lib/supabase/server";

export type VerificationResult = { error?: string; success?: string };

function siteUrlFromEnv(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Resend the signup confirmation email for the CURRENTLY SIGNED-IN user whose
 * email is still unverified (rule #2). Address comes from the session only —
 * the client can never request a resend for an arbitrary address (#74).
 */
export async function resendVerificationAction(): Promise<VerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sesi berakhir. Silakan login kembali." };
  if (user.email_confirmed_at || user.confirmed_at)
    return { success: "Email Anda sudah terverifikasi." };

  const email = user.email ?? "";

  // Supabase `auth.resend` re-delivers the signup template (rule #2).
  const { error: resendErr } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrlFromEnv()}/auth/callback?next=/masuk` },
  });
  if (resendErr) return { error: "Gagal mengirim email verifikasi. Coba beberapa saat lagi." };

  return { success: "Email verifikasi telah dikirim ulang. Silakan periksa inbox Anda." };
}
