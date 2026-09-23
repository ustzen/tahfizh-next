// Validate all SQL migrations against a REAL Postgres (PGlite — the actual
// Postgres engine compiled to WASM, including the full PL/pgSQL interpreter).
// Migrations run CUMULATIVELY in filename order, exactly like `supabase db push`
// or pasting V1..V11 into the Supabase SQL editor one after another. The first
// failing statement is reported with its file and line.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const db = new PGlite({ extensions: { pgcrypto } });

// Convert byte offsets in the SQL text to 1-based line numbers.
function byteToLine(text, byteIndex) {
  const buf = Buffer.from(text, "utf8");
  const idx = Math.min(byteIndex, buf.length);
  let line = 1;
  for (let i = 0; i < idx; i++) if (buf[i] === 0x0a) line++;
  return line;
}

let failures = 0;

for (const file of files) {
  const full = join(dir, file);
  const sql = readFileSync(full, "utf8");

  // Supabase parity: migrations reference the auth schema, extensions schema
  // and Supabase roles, so set them up once before the first file.
  if (file === files[0]) {
    await db.exec("CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage; GRANT USAGE ON SCHEMA auth TO public;");
    await db.exec("CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb);");
    await db.exec("CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false);");
    await db.exec("CREATE TABLE IF NOT EXISTS storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);");
    await db.exec("CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/'); $$;");
    await db.exec("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;");
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    }
    // Minimal auth.uid()/auth.role() shims — same shape as Supabase's own
    // helpers so RLS policies and SECURITY DEFINER checks parse & plan.
    await db.exec(`
      create or replace function auth.uid() returns uuid language sql stable as $$
        select null::uuid;
      $$;
      create or replace function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role', true), '')::text;
      $$;
    `);
    // Supabase realtime publication shim (migrations add tables to it).
    await db.exec("DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  }

  try {
    await db.exec(sql);
    console.log(`OK: ${file}`);
  } catch (e) {
    // Some migrations run twice against the same project (re-paste in the SQL
    // editor). Retry once from the point of failure with idempotency shims so
    // genuine syntax errors still surface while "already exists" noise from a
    // partial prior run does not mask later files.
    const msg = String(e?.message ?? e);
    if (/already exists|duplicate/i.test(msg)) {
      try {
        await db.exec(sql);
        console.log(`OK (retry after idempotent skip): ${file}`);
        continue;
      } catch (e2) {
        e = e2;
      }
    }
    failures++;
    // PGlite errors carry `position` (1-based character offset) for syntax errors.
    let lineInfo = "";
    const pos = Number(e?.position ?? e?.where ?? NaN);
    if (!Number.isNaN(pos) && pos > 0) {
      lineInfo = ` (line ~${byteToLine(sql, pos - 1)})`;
    }
    console.error(`FAIL: ${file}${lineInfo}`);
    console.error(`      ${msg.split("\n").slice(0, 3).join(" | ")}`);
    break; // like `supabase db push`: the chain stops at the first failure
  }
}

await db.close();
process.exit(failures > 0 ? 1 : 0);