import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ROLE_PREFIX: Record<string, string> = {
  DEVELOPER: "/developer",
  ADMIN: "/admin",
  KOORDINATOR: "/koordinator",
  USTADZ: "/ustadz",
  WALI_SANTRI: "/santri",
};

const AUTH_PAGES = ["/masuk", "/daftar", "/lupa-password"];
const VERIF_PATH = "/verifikasi-email";

/**
 * 1. Refreshes the Supabase session cookie on every matched request.
 * 2. Guards dashboard sections by trusted profile role (server-side check —
 *    the client can never spoof its way into another tenant's section).
 * 3. Bounces signed-in users away from auth pages.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const needsAuthCheck =
    ROLE_PREFIX && (Object.values(ROLE_PREFIX).some((p) => pathname === p || pathname.startsWith(p + "/")) ||
      AUTH_PAGES.includes(pathname) || pathname === VERIF_PATH);

  let response = NextResponse.next({ request });

  if (!needsAuthCheck) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (AUTH_PAGES.includes(pathname) && user) {
    // Already signed in — send to the role home.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const home = (profile?.role && ROLE_PREFIX[profile.role]) || "/";
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isProtected = Object.values(ROLE_PREFIX).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/masuk";
    url.search = `?returnTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isProtected && user) {
    // V11 (rule #2): unverified email limits access to the verification page
    // until the address is confirmed. Verified users are unaffected.
    const unverified = !user.email_confirmed_at && !user.confirmed_at;
    if (unverified && pathname !== VERIF_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = VERIF_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowed = profile?.role && Object.values(ROLE_PREFIX).some((p) => pathname.startsWith(p));

    if (allowed && profile.role !== "DEVELOPER") {
      // Wrong-role visit (e.g. USTADZ opening /admin): redirect to own home.
      const own = ROLE_PREFIX[profile.role] ?? "/";
      if (!pathname.startsWith(own)) {
        const url = request.nextUrl.clone();
        url.pathname = own;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    // V10 payment gate (rule #7/#8/#10): from day 16 of the month, a wali with
    // unpaid current-month infak can ONLY reach /santri/infak (and its return
    // success page). All other roles are never locked (rule #11).
    if (profile?.role === "WALI_SANTRI" && pathname.startsWith("/santri")) {
      const isInfakPath = pathname === "/santri/infak" || pathname.startsWith("/santri/infak/");
      if (!isInfakPath) {
        const { data: gate } = await supabase.rpc("wali_payment_gate");
        if (gate?.locked === true) {
          const url = request.nextUrl.clone();
          url.pathname = "/santri/infak";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/developer/:path*",
    "/admin/:path*",
    "/koordinator/:path*",
    "/ustadz/:path*",
    "/santri/:path*",
    "/masuk",
    "/daftar",
    "/lupa-password",
    "/verifikasi-email",
  ],
};
