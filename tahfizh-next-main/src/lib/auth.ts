import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";
import { ROLE_HOME } from "@/lib/roles";

export type SessionProfile = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  tenantId: string | null;
  tenantName: string | null;
  tenantCode: string | null;
  tenantStatus: "ACTIVE" | "INACTIVE" | null;
  gender: "L" | "P" | null;
};

/**
 * Reads the auth session + profile ONCE per request (single round-trip pair).
 * The profile is the ONLY trusted source of role/tenant — never the client.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, tenant_id, gender, tenants(name, business_code, status)"
    )
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const tenant = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;

  return {
    id: profile.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: profile.role as AppRole,
    tenantId: profile.tenant_id,
    tenantName: tenant?.name ?? null,
    tenantCode: tenant?.business_code ?? null,
    tenantStatus: tenant?.status ?? null,
    gender: profile.gender ?? null,
  };
}

/** For dashboard pages: require session + correct role; otherwise redirect. */
export async function requireRole(roles: AppRole[], returnTo?: string) {
  const profile = await getSessionProfile();

  if (!profile) {
    redirect(`/masuk${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  }
  if (!roles.includes(profile.role)) {
    redirect(ROLE_HOME[profile.role]);
  }

  return profile;
}

/** Sign out helper shared by header (client) and actions. */
export async function signOutAndRedirect() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/masuk");
}
