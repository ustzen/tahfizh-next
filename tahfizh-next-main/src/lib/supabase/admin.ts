import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for SERVER ONLY use (server actions, seed script).
 * Bypasses RLS — needed to create auth users (signup/invite) and for the
 * Developer tenant status toggle which is not exposed to client roles.
 * NEVER import this from a client component.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
