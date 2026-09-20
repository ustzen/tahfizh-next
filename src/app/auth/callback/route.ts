import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback (PKCE). Recovery/invite emails point here with a
 * `?code=`; we exchange it server-side, set the session cookies, then forward
 * to the destination page (e.g. /reset-password).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/reset-password"}`);
    }
  }

  // Login Google gagal/dibatalkan — kembali ke halaman masuk.
  if (next.startsWith("/auth/google/complete")) {
    return NextResponse.redirect(`${origin}/masuk?error=google_failed`);
  }

  // Invalid/expired code — send to forgot password to restart the flow.
  return NextResponse.redirect(`${origin}/lupa-password?error=expired`);
}
