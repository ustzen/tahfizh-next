"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rate-limit";

export type GoogleAuthResult = { error?: string };

/** Base URL aplikasi tanpa trailing slash: env dulu, fallback ke header request. */
async function siteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Login via Google (OAuth PKCE).
 *
 * Alur: server action ini membuat URL otorisasi Google lewat Supabase lalu
 * me-redirect browser ke sana. Setelah Google selesai, Supabase mengarahkan
 * kembali ke /auth/callback (menukar `code` jadi session) lalu diteruskan ke
 * /auth/google/complete yang MEMVERIFIKASI bahwa email Google tersebut sudah
 * terdaftar & terkonfirmasi. Email yang belum terdaftar ditolak.
 *
 * Catatan: Supabase otomatis menautkan identitas Google ke akun email yang
 * sudah ada bila email-nya sama dan sudah terverifikasi.
 */
export async function googleLoginAction(
  _prev: GoogleAuthResult | null,
  _formData: FormData
): Promise<GoogleAuthResult> {
  const ip = await clientIpFromHeaders();
  const limited = consumeRateLimit(`login:google:${ip}`, 10, 5 * 60_000);
  if (!limited.ok) {
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${limited.retryAfterSeconds} detik.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=/auth/google/complete`,
      // Selalu tampilkan pemilih akun Google.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    console.error("[googleLoginAction] signInWithOAuth failed:", error?.message);
    return { error: "Login Google belum bisa digunakan. Coba lagi atau hubungi pengelola." };
  }

  redirect(data.url);
}
