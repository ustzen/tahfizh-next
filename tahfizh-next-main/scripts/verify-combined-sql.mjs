// Verify supabase/tahfizh-combined.sql against a REAL Postgres engine (PGlite).
//
// 1. Run 1 — fresh database: file gabungan harus berhasil utuh.
// 2. Run 2 — same database: file gabungan harus berhasil LAGI tanpa satu pun
//    error "already exists" (bukti idempoten — bukan retry dengan shim).
// 3. Regresi V12 — backfill default (V4/V5/V6) dijalankan untuk tenant yang
//    SUDAH ADA (dulu: error 42883 "function xxx_seed_materials(tenants) does
//    not exist") + trigger seed otomatis untuk tenant baru + uji idempoten.
// 4. Sanity count: tabel, trigger, policy, fungsi yang tercipta.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const FILE = "supabase/tahfizh-combined.sql";
const sql = readFileSync(FILE, "utf8");

const db = new PGlite({ extensions: { pgcrypto } });

// Supabase parity shims (sama seperti scripts/sql-parse-check.mjs)
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

function byteToLine(text, byteIndex) {
  const buf = Buffer.from(text, "utf8");
  const idx = Math.min(byteIndex, buf.length);
  let line = 1;
  for (let i = 0; i < idx; i++) if (buf[i] === 0x0a) line++;
  return line;
}

let failed = false;
for (const run of [1, 2]) {
  try {
    await db.exec(sql);
    console.log(`RUN ${run}: OK (idempoten — sukses dijalankan ${run}x berturut-turut)`);
  } catch (e) {
    failed = true;
    const msg = String(e?.message ?? e);
    let lineInfo = "";
    const pos = Number(e?.position ?? NaN);
    if (!Number.isNaN(pos) && pos > 0) lineInfo = ` (line ~${byteToLine(sql, pos - 1)})`;
    console.error(`RUN ${run}: FAIL${lineInfo}`);
    console.error(`      ${msg.split("\n").slice(0, 3).join(" | ")}`);
    break;
  }
}

const q = async (text) => (await db.query(text)).rows;

// ---------------------------------------------------------------------------
// Regresi V12: backfill default untuk tenant yang SUDAH ADA.
// Versi lama memanggil fungsi TRIGGER (tanpa argumen) dengan argumen baris
// tenants → 42883 "function public.tartil_seed_materials(tenants) does not
// exist". Kini backfill harus sukses, mengisi default, dan idempoten.
// ---------------------------------------------------------------------------
if (!failed) {
  try {
    const counts = (tid) => q(`select
      (select count(*)::int from public.tartil_materials where tenant_id = '${tid}') tartil_m,
      (select count(*)::int from public.tartil_note_templates where tenant_id = '${tid}') tartil_t,
      (select count(*)::int from public.tahfidz_submission_templates where tenant_id = '${tid}') setoran_t,
      (select count(*)::int from public.learning_note_templates where tenant_id = '${tid}') learning_t`);

    const backfillAll = (tid) => q(`
      select public.tartil_backfill_defaults('${tid}'),
             public.tahfidz_backfill_submission_defaults('${tid}'),
             public.learning_backfill_defaults('${tid}')`);

    // (a) Tenant "lama" → backfill eksplisit mengisi default tanpa error 42883.
    const tidA = (
      await q(`insert into public.tenants (business_code, name)
               values ('T-VERIFY-1', 'Lembaga Uji T-VERIFY-1')
               on conflict (business_code) do nothing
               returning id`)
    )[0]?.id;
    if (tidA) {
      await backfillAll(tidA);
      const c1 = (await counts(tidA))[0];
      if (!(c1.tartil_m === 7 && c1.tartil_t === 16 && c1.setoran_t === 13 && c1.learning_t === 31)) {
        throw new Error(`default tenant "lama" salah: ${JSON.stringify(c1)}`);
      }

      // (b) Backfill dijalankan LAGI → jumlah tidak berubah (idempoten).
      await backfillAll(tidA);
      const c2 = (await counts(tidA))[0];
      if (JSON.stringify(c1) !== JSON.stringify(c2)) {
        throw new Error(`backfill tidak idempoten: ${JSON.stringify(c1)} -> ${JSON.stringify(c2)}`);
      }
    }

    // (c) Tenant baru via INSERT biasa → trigger seed otomatis tetap bekerja.
    const tidB = (
      await q(`insert into public.tenants (business_code, name)
               values ('T-VERIFY-2', 'Lembaga Uji T-VERIFY-2') returning id`)
    )[0].id;
    const c3 = (await counts(tidB))[0];
    if (!(c3.tartil_m === 7 && c3.setoran_t === 13 && c3.learning_t === 31)) {
      throw new Error(`trigger seed tenant baru salah: ${JSON.stringify(c3)}`);
    }
    console.log("Regresi backfill/seed default (V4/V5/V6): OK (tenant lama + baru, idempoten)");
  } catch (e) {
    failed = true;
    console.error("Regresi backfill/seed default: FAIL");
    console.error(`      ${String(e?.message ?? e).split("\n").slice(0, 3).join(" | ")}`);
  }
}

if (!failed) {
  const tables = (await q("select count(*)::int n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"))[0].n;
  const views = (await q("select count(*)::int n from information_schema.views where table_schema = 'public'"))[0].n;
  const triggers = (await q("select count(*)::int n from pg_trigger where not tgisinternal"))[0].n;
  const policies = (await q("select count(*)::int n from pg_policies where schemaname = 'public'"))[0].n;
  const funcs = (await q("select count(*)::int n from information_schema.routines where routine_schema = 'public' and routine_type = 'FUNCTION'"))[0].n;
  const enums = (await q("select count(*)::int n from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'"))[0].n;
  const surahs = (await q("select count(*)::int n from public.tahfidz_surahs"))[0].n;
  const templates = (await q("select count(*)::int n from public.report_templates where tenant_id is null"))[0].n;
  console.log("\nSanity setelah 2x run:");
  console.log(`  tabel public: ${tables}, view: ${views}, enum: ${enums}`);
  console.log(`  trigger non-internal: ${triggers}, policy RLS public: ${policies}, fungsi public: ${funcs}`);
  console.log(`  seed surah Juz 30: ${surahs} baris (harus 37 — tidak dobel), template raport global: ${templates} (harus 3 — tidak dobel)`);
}

await db.close();
process.exit(failed ? 1 : 0);
