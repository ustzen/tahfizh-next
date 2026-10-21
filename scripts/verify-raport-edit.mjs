// Functional check of the TAHFIZH Raport Builder edit flow (V13/V71 semantics)
// against a REAL Postgres (PGlite). This replays exactly what the UI does:
//
//   DEVELOPER  → report_template_save (contoh bawaan global)
//   ADMIN      → gallery → duplicate → set_primary → detail → save_layout
//   KOORDINATOR→ detail → save_layout (perluasan V13)
//   USTADZ     → detail → save_layout (perluasan V13 + V71/fix detail), dan
//                detail template GLOBAL harus tetap dipagari (null).
//   Semua role → layout tidak valid harus ditolak (report_layout_valid).
//
// First failure is reported and the script exits 1.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const db = new PGlite({ extensions: { pgcrypto } });

/* --------------------------- bootstrap schema ----------------------------- */
// Supabase shims — identical to scripts/sql-parse-check.mjs.
await db.exec("CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage; GRANT USAGE ON SCHEMA auth TO public;");
await db.exec("CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb);");
await db.exec("CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false);");
await db.exec("CREATE TABLE IF NOT EXISTS storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);");
await db.exec("CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/'); $$;");
await db.exec("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;");
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
}
  // Minimal auth.uid()/auth.role() shims needed while migrations reference them.
  await db.exec(`
    create or replace function auth.uid() returns uuid language sql stable as $$
      select null::uuid;
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')::text;
    $$;
  `);
  await db.exec("DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");

/* ------------------------------- migrations -------------------------------- */
for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  try {
    await db.exec(sql);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/already exists|duplicate/i.test(msg)) {
      try { await db.exec(sql); continue; } catch (e2) { e = e2; }
    }
    console.error(`FAIL(migration): ${file}: ${msg.split("\n")[0]}`);
    await db.close();
    process.exit(1);
  }
}

// Make auth.uid() session-aware so we can replay logged-in users per claim.
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;`);

/* ------------------------------- seeding ----------------------------------- */
const tenantId = crypto.randomUUID();
const devId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const coId = crypto.randomUUID();
const guruId = crypto.randomUUID();

await db.exec(`insert into auth.users (id, email) values ('${devId}','dev@dup.test'), ('${adminId}','admin@dup.test'), ('${coId}','co@dup.test'), ('${guruId}','guru@dup.test');`);
await db.exec(`insert into public.tenants (id, business_code, name) values ('${tenantId}', 'T-TEST', 'Lembaga Uji Builder');`);
await db.exec(`insert into public.profiles (id, full_name, role, tenant_id) values
  ('${devId}','Developer Uji','DEVELOPER', null),
  ('${adminId}','Admin Uji','ADMIN', '${tenantId}'),
  ('${coId}','Koordinator Uji','KOORDINATOR', '${tenantId}'),
  ('${guruId}','Guru Uji','USTADZ', '${tenantId}');`);

/* ------------------------------ helpers ------------------------------------ */
let failures = 0;
function fail(label, err) {
  failures++;
  console.error(`FAIL: ${label}${err ? ` — ${err}` : ""}`);
}
function pass(label) {
  console.log(`OK: ${label}`);
}

// Execute a query with an active JWT-sub (used by the auth.uid() shim).
async function as(sub, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  const res = await db.query(sql, params ?? []);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  return res;
}

async function expectError(label, rejectPattern, fn) {
  try {
    await fn();
    fail(label, "diterima padahal harusnya ditolak");
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (rejectPattern.test(msg)) pass(label);
    else fail(label, `error salah: ${msg.split("\n")[0]}`);
  }
}

const layoutV1 = { pages: [{ components: [{ id: "t1", type: "CUSTOM_TEXT", x: 40, y: 50, w: 300, h: 40 }] }] };
const layoutV2 = { pages: [{ components: [
  { id: "t1", type: "CUSTOM_TEXT", x: 80, y: 90, w: 420, h: 60 },
  { id: "t2", type: "DIVIDER", x: 20, y: 20, w: 500, h: 4, props: { thickness: 2 } },
] }] };

/* --------------------------------- tests ----------------------------------- */
try {
  // 1) DEVELOPER membuat contoh bawaan global.
  const devSave = await as(devId, "select public.report_template_save(null, $1, $2, 'A4', 'PORTRAIT', $3::jsonb)", [
    "Raport Uji Global", "Untuk uji builder", JSON.stringify(layoutV1),
  ]);
  const globalId = devSave.rows[0][Object.keys(devSave.rows[0])[0]];
  if (!globalId) fail("developer membuat contoh global", "id null");
  else pass("developer membuat contoh global");

  // 2) ADMIN melihat galeri (GLOBAL + belum ada TENANT).
  const gal0 = await as(adminId, "select * from public.report_template_gallery()");
  if (gal0.rows.some((r) => r.id === globalId && r.scope === "GLOBAL")) pass("galeri admin memuat contoh global");
  else fail("galeri admin memuat contoh global");

  // 3) ADMIN "Pakai Contoh Ini" → salinan tenant.
  const dup = await as(adminId, "select public.report_template_duplicate($1, $2)", [globalId, null]);
  const copyId = dup.rows[0][Object.keys(dup.rows[0])[0]];
  if (!copyId) fail("admin menggandakan contoh jadi template lembaga", "id null");
  else pass("admin menggandakan contoh jadi template lembaga");

  // Salinan harus tenant-scoped.
  const scope = await db.query("select tenant_id, is_primary from public.report_templates where id = $1", [copyId]);
  if (scope.rows[0]?.tenant_id === tenantId) pass("salinan milik lembaga");
  else fail("salinan milik lembaga", `tenant_id=${scope.rows[0]?.tenant_id}`);

  // 4) Jadikan raport utama, lalu galeri menampilkannya sebagai utama.
  await as(adminId, "select public.report_template_set_primary($1)", [copyId]);
  const gal1 = await as(adminId, "select * from public.report_template_gallery()");
  const primaryRow = gal1.rows.find((r) => r.id === copyId);
  if (primaryRow && primaryRow.is_primary && primaryRow.layout !== null) pass("raport utama lembaga tampil di galeri beserta layout");
  else fail("raport utama lembaga tampil di galeri beserta layout");

  // 5) ADMIN membuka detail + menyimpan layout (Simpan di Builder).
  const det = await as(adminId, "select * from public.report_template_detail($1)", [copyId]);
  if (det.rows[0]?.layout?.pages) pass("admin membuka detail template (builder terisi layout)");
  else fail("admin membuka detail template (builder terisi layout)");
  await as(adminId, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify(layoutV2)]);
  const v2 = await db.query("select version, layout = $2::jsonb as equal from public.report_templates where id = $1", [copyId, JSON.stringify(layoutV2)]);
  if (v2.rows[0]?.equal && v2.rows[0]?.version >= 2) pass("admin simpan layout (versi naik & tersimpan)");
  else fail("admin simpan layout (versi naik & tersimpan)", JSON.stringify(v2.rows[0]));

  // 6) ADMIN tidak boleh mengubah template global milik Developer.
  await expectError("admin ditolak menyimpan layout template global", /AKSES_DITOLAK/i,
    () => as(adminId, "select public.report_template_save_layout($1, $2::jsonb)", [globalId, JSON.stringify(layoutV2)]));

  // 7) KOORDINATOR: detail + simpan layout (perluasan V13).
  const detCo = await as(coId, "select * from public.report_template_detail($1)", [copyId]);
  if (detCo.rows[0]?.layout?.pages) pass("koordinator membuka detail template");
  else fail("koordinator membuka detail template");
  await as(coId, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify({ pages: [{ components: [{ id: "t1", type: "CUSTOM_TEXT", x: 10, y: 10, w: 200, h: 30 }] }] })]);
  pass("koordinator simpan layout");

  // 8) USTADZ: detail harus terbuka (regresi utama V71) + simpan layout.
  const detG = await as(guruId, "select * from public.report_template_detail($1)", [copyId]);
  if (detG.rows[0]?.layout?.pages) pass("ustadz membuka detail template (fix V71)");
  else fail("ustadz membuka detail template (fix V71)", "rpc kembalikan nihil");
  await as(guruId, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify(layoutV1)]);
  pass("ustadz simpan layout");

  // 9) USTADZ TIDAK boleh membuka/mengubah contoh global.
  const detGlobal = await as(guruId, "select * from public.report_template_detail($1)", [globalId]);
  if (detGlobal.rows.length === 0) pass("ustadz tidak bisa membuka contoh global");
  else fail("ustadz tidak bisa membuka contoh global");
  await expectError("ustadz ditolak menyimpan layout template global", /AKSES_DITOLAK/i,
    () => as(guruId, "select public.report_template_save_layout($1, $2::jsonb)", [globalId, JSON.stringify(layoutV2)]));

  // 10) Layout tidak valid ditolak oleh RPC simpan.
  await expectError("layout tidak valid ditolak", /LAYOUT_TIDAK_VALID/i,
    () => as(adminId, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify({ pages: [{ components: [{ id: "x", type: "BOX", x: -9, y: 0, w: 100, h: 30 }] }] })]));
  await expectError("layout tanpa halaman ditolak", /LAYOUT_TIDAK_VALID/i,
    () => as(adminId, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify({ pages: [] })]));

  // 11) Isolasi tenant: lembaga lain tidak melihat/mengubah salinan.
  const tenant2 = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  await db.exec(`insert into auth.users (id, email) values ('${otherId}', 'lain@dup.test');`);
  await db.exec(`insert into public.tenants (id, business_code, name) values ('${tenant2}', 'T-TEST2', 'Lembaga Uji Lain');`);
  await db.exec(`insert into public.profiles (id, full_name, role, tenant_id) values ('${otherId}', 'Admin Lain', 'ADMIN', '${tenant2}');`);
  const otherAdmin = (await db.query("select id from public.profiles where tenant_id = $1 and role = 'ADMIN'", [tenant2])).rows[0]?.id;
  await expectError("admin lembaga lain ditolak menyimpan salinan", /AKSES_DITOLAK/i,
    () => as(otherAdmin, "select public.report_template_save_layout($1, $2::jsonb)", [copyId, JSON.stringify(layoutV2)]));
  const detOther = await as(otherAdmin, "select * from public.report_template_detail($1)", [copyId]);
  if (detOther.rows.length === 0) pass("admin lembaga lain tidak bisa membuka salinan");
  else fail("admin lembaga lain tidak bisa membuka salinan");
} catch (e) {
  fail("alur builder dieksekusi", String(e?.message ?? e).split("\n")[0]);
}

await db.close();
console.log(failures === 0 ? "OK: verifikasi alur edit raport lulus." : `GAGAL: ${failures} pemeriksaan gagal.`);
process.exit(failures === 0 ? 0 : 1);
