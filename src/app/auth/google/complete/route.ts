import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HOME, type AppRole } from "@/lib/roles";

/**
 * Tahap akhir login Google — dipanggil setelah /auth/callback menukar `code`
 * menjadi session.
 *
 * Hanya akun yang SUDAH TERDAFTAR (punya baris di `profiles`) dan emailnya
 * SUDAH DIKONFIRMASI yang boleh masuk. Google tidak dipakai untuk mendaftar.
 * Bila Google membuat user auth baru (email belum terdaftar), user itu dihapus
 * lagi agar tidak ada akun yatim di Supabase Auth.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/masuk?error=${reason}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("google_failed");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Hapus HANYA user yang murni dibuat oleh Google (satu-satunya provider
    // = google) dan tidak punya profil — user email/password tidak tersentuh.
    const providers: string[] = Array.isArray(user.app_metadata?.providers)
      ? user.app_metadata.providers
      : user.app_metadata?.provider
        ? [user.app_metadata.provider]
        : [];
    const googleOnly = providers.length > 0 && providers.every((p) => p === "google");

    await supabase.auth.signOut();
    if (googleOnly) {
      try {
        await createAdminClient().auth.admin.deleteUser(user.id);
      } catch (e) {
        console.error("[google/complete] cleanup user gagal:", e instanceof Error ? e.message : e);
      }
    }
    return fail("google_unregistered");
  }

  if (!user.email_confirmed_at && !user.confirmed_at) {
    await supabase.auth.signOut();
    return fail("google_unconfirmed");
  }

  return NextResponse.redirect(`${origin}${ROLE_HOME[profile.role as AppRole] ?? "/"}`);
}
