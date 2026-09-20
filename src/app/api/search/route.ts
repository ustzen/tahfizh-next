import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getGlobalSearchResults, isSearchableQuery } from "@/lib/search";

/**
 * TAHFIZH V12 — endpoint pencarian global.
 * Role + tenant diambil dari session server (bukan dari client); hasil
 * dibatasi jumlahnya dan tidak pernah memuat ID internal.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchableQuery(q)) {
    return NextResponse.json({ results: [] });
  }

  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await getGlobalSearchResults(q, profile.role);
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
