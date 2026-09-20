// Simulasi persis kasus user:
// 1. DB fresh + SEED 1 lembaga (tenant) — persis kondisi user sebelum rerun.
// 2. Jalankan file gabungan LAMA (commit da1ff5c, backfill rusak) → gagal 42883 di tengah.
// 3. Jalankan supabase/fix-backfill-defaults.sql → harus sukses.
// 4. Jalankan file gabungan BARU di DB yang sama → harus sukses (recovery penuh).
// 5. Jalankan file gabungan BARU SEKALI LAGI → tetap sukses (idempoten).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NEW_SQL = readFileSync("supabase/tahfizh-combined.sql", "utf8");
const PATCH_SQL = readFileSync("supabase/fix-backfill-defaults.sql", "utf8");
const OLD_SQL = execSync("git show da1ff5c:supabase/tahfizh-combined.sql", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const db = new PGlite({ extensions: { pgcrypto } });

// Supabase parity shims (sama seperti scripts/verify-combined-sql.mjs)
await db.exec("CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage; GRANT USAGE ON SCHEMA auth TO public;");
await db.exec("CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb);");
await db.exec("CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false);");
await db.exec("CREATE TABLE IF NOT EXISTS storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);");
await db.exec("CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/'); $$;");
await db.exec("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;");
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
}
await db.exec(`
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;
  create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text; $$;
`);
await db.exec("DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");

const q = async (text) => (await db.query(text)).rows;
let failed = false;
const fail = (msg) => { failed = true; console.error(`  ✗ ${msg}`); };

// ---------------------------------------------------------------------------
// STEP 0 — DB fresh: jalankan file gabungan LAMA sampai sukses penuh (V1–V12
// lolos karena BELUM ada tenant → loop backfill melewati 0 baris).
// ---------------------------------------------------------------------------
let tenantId;
try {
  await db.exec(OLD_SQL);
  console.log("STEP 0 OK: file lama sukses di DB fresh (belum ada lembaga — loop backfill kosong).");
} catch (e) {
  fail(`STEP 0: file lama di DB fresh seharusnya sukses: ${String(e?.message ?? e).split("\n")[0]}`);
}

// ---------------------------------------------------------------------------
// STEP 1 — user pakai app → lembaga dibuat. Lalu RERUN file lama → 42883.
// ---------------------------------------------------------------------------
try {
  await db.exec("insert into public.tenants (business_code, name) values ('T-RECOVER-1', 'Lembaga Recovery')");
  tenantId = (await q("select id from public.tenants where business_code = 'T-RECOVER-1' limit 1"))[0]?.id;
  if (!tenantId) fail("tenant uji gagal dibuat");
} catch (e) {
  fail(`STEP 1 (buat lembaga) gagal: ${String(e?.message ?? e).split("\n")[0]}`);
}
try {
  await db.exec(OLD_SQL);
  fail("File lama seharusnya GAGAL (42883) setelah lembaga ada, tapi sukses — simulasi tidak valid.");
} catch (e) {
  console.log(`STEP 1 OK: rerun file lama gagal seperti di user: ${String(e?.message ?? e).split("\n")[0].slice(0, 100)}`);
}

// ---------------------------------------------------------------------------
// STEP 2 — patch standalone HARUS sukses di DB setengah-migrasi ini.
// ---------------------------------------------------------------------------
try {
  await db.exec(PATCH_SQL);
  console.log("STEP 2 OK: supabase/fix-backfill-defaults.sql sukses dijalankan di DB rusak.");
} catch (e) {
  fail(`Patch gagal: ${String(e?.message ?? e).split("\n").slice(0, 3).join(" | ")}`);
}

// Patch idempoten — dijalankan LAGI harus tetap sukses.
try {
  await db.exec(PATCH_SQL);
  console.log("STEP 2b OK: patch idempoten (dijalankan 2x tanpa error).");
} catch (e) {
  fail(`Patch rerun gagal: ${String(e?.message ?? e).split("\n").slice(0, 3).join(" | ")}`);
}

// ---------------------------------------------------------------------------
// STEP 3 — file gabungan BARU di DB yang sama → recovery penuh, idempoten.
// ---------------------------------------------------------------------------
for (const run of [1, 2]) {
  try {
    await db.exec(NEW_SQL);
    console.log(`STEP 3 (run ${run}) OK: file gabungan baru sukses di DB yang tadinya rusak.`);
  } catch (e) {
    fail(`File gabungan baru run ${run} gagal: ${String(e?.message ?? e).split("\n").slice(0, 3).join(" | ")}`);
    break;
  }
}

// ---------------------------------------------------------------------------
// Sanity: default terisi benar untuk tenant uji & tidak dobel.
// ---------------------------------------------------------------------------
if (!failed && tenantId) {
  try {
    const c = (
      await q(`select
        (select count(*)::int from public.tartil_materials where tenant_id = '${tenantId}') tartil_m,
        (select count(*)::int from public.tartil_note_templates where tenant_id = '${tenantId}') tartil_t,
        (select count(*)::int from public.tahfidz_submission_templates where tenant_id = '${tenantId}') setoran_t,
        (select count(*)::int from public.learning_note_templates where tenant_id = '${tenantId}') learning_t`)
    )[0];
    if (!(c.tartil_m === 7 && c.tartil_t === 5 && c.setoran_t === 5 && c.learning_t === 15)) {
      fail(`default tidak lengkap/berlebih: ${JSON.stringify(c)}`);
    } else {
      console.log(`Sanity OK: default tenant uji lengkap (tartil ${c.tartil_m}+${c.tartil_t}, setoran ${c.setoran_t}, learning ${c.learning_t}) — tidak dobel.`);
    }
  } catch (e) {
    fail(`Sanity gagal: ${String(e?.message ?? e).split("\n")[0]}`);
  }
}

await db.close();
if (failed) {
  console.error("HASIL: FAIL");
  process.exit(1);
}
console.log("HASIL: PASS — recovery DB rusak → patch → file gabungan baru aman & idempoten.");
