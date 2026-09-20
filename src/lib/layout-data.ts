import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";

export type DisplayProfile = SessionProfile & {
  frontTitle: string | null;
  backTitle: string | null;
  avatarUrl: string | null;
};

/**
 * Enriched profile for layout chrome: adds titles + avatar in the same single
 * query pattern as getSessionProfile (request-cached via React cache()).
 */
export const getDisplayProfile = cache(async (): Promise<DisplayProfile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `id, full_name, role, tenant_id, gender, front_title, back_title, avatar_url,
       tenants(name, business_code, status)`
    )
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const tenant = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;

  return {
    id: profile.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
    tenantId: profile.tenant_id,
    tenantName: tenant?.name ?? null,
    tenantCode: tenant?.business_code ?? null,
    tenantStatus: tenant?.status ?? null,
    gender: profile.gender ?? null,
    frontTitle: profile.front_title ?? null,
    backTitle: profile.back_title ?? null,
    avatarUrl: profile.avatar_url ?? null,
  } satisfies DisplayProfile;
});
