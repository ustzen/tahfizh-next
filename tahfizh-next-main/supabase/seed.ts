/**
 * TAHFIZH seed script — creates the platform DEVELOPER account.
 *
 * Usage:
 *   bun supabase/seed.ts <dev-user-id>          # id of an existing auth user
 *   bun supabase/seed.ts --email a@b.c          # creates the auth user too
 *
 * The resulting DEVELOPER profile is platform-scoped (no tenant) and has no
 * tenant data. It only unlocks the Developer dashboard (lembaga list).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env (.env.local)."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const args = process.argv.slice(2);
const argEmail = args.find((a) => a === "--email");
const emailIdx = args.indexOf("--email");

async function main() {
  let userId: string | undefined;
  let email: string;
  let password: string;

  if (emailIdx !== -1 && args[emailIdx + 1]) {
    email = args[emailIdx + 1];
    password = process.env.DEVELOPER_PASSWORD ?? "tahfizh-dev-2026";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Developer TAHFIZH" },
    });
    if (error) throw error;
    userId = data.user!.id;
    console.log(`Created auth user ${email}`);
  } else {
    userId = args[0];
    if (!userId) {
      console.error(
        "Provide either an existing auth user UUID, or --email <email> to create one.\n" +
          "  bun supabase/seed.ts <75f069a0-84c1-4b52-8f7a-dd2ecc9786de>\n" +
          "  bun supabase/seed.ts --arifinzainal2015@gmail.com"
      );
      process.exit(1);
    }
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new Error(`User ${userId} not found in Supabase Auth.`);
    }
    email = data.user.email ?? "";
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    full_name: "Developer TAHFIZH",
    role: "DEVELOPER",
    tenant_id: null,
  });
  if (profileErr) throw profileErr;

  console.log(`DEVELOPER profile ready for ${email} (${userId}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
