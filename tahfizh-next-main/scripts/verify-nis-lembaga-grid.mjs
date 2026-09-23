// Verifikasi fungsional migration V30 — NIS lembaga pada grid guru.
// Menjalankan SEMUA migration di PGlite lalu menguji bahwa kelima RPC
// (halaqah_detail, tahfidz_surahs_grid, learning_grid, tajwid_materi_grid,
// tugas_halaqah_grid) mengembalikan `code` = students.nis (NIS lembaga),
// BUKAN business_code berawalan "S-" (nomor ID web), dan urutan NIS alami
// (9 sebelum 10; santri tanpa NIS paling bawah).
//
// Jalankan:  node scripts/verify-nis-lembaga-grid.mjs
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const db = new PGlite({ extensions: { pgcrypto } });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
  if (!cond) failed++;
};

// ---- bootstrap (sama dengan verify-infak-tidak-mampu.mjs) -------------------
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
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')::text;
  $$;
`);
await db.exec("DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");

const dir = "supabase/migrations";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(dir, f), "utf8"));
}
console.log("Migration selesai dimuat.\n");

// ---- fixtures ---------------------------------------------------------------
const T1 = "10000000-0000-0000-0000-000000000001";
const UGuru = "00000000-0000-0000-0000-000000000011";
const Halaqah = "30000000-0000-0000-0000-000000000001";
const ST = {
  // NIS beda panjang → urut alami: 999 < 1001; tanpa NIS paling bawah.
  a: "20000000-0000-0000-0000-0000000000a1", // NIS 999
  b: "20000000-0000-0000-0000-0000000000b2", // NIS 1001
  c: "20000000-0000-0000-0000-0000000000c3", // tanpa NIS
};

await db.exec(`
  insert into auth.users (id, email) values ('${UGuru}', 'guru@x.id');
  insert into public.tenants (id, business_code, name, kind, status, created_at) values
    ('${T1}', 'T-777', 'Lembaga NIS', 'TPQ', 'ACTIVE', now() - interval '3 months');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${UGuru}', 'Guru NIS', 'USTADZ', '${T1}');
  insert into public.teachers (tenant_id, business_code, full_name, gender, status) values
    ('${T1}', 'T-777-G1', 'Guru NIS', 'L', 'ACTIVE');
  insert into public.students (id, tenant_id, business_code, nis, full_name, gender, status) values
    ('${ST.a}', '${T1}', 'S-7001', '999', 'Santri NIS Pendek', 'L', 'ACTIVE'),
    ('${ST.b}', '${T1}', 'S-7002', '1001', 'Santri NIS Panjang', 'P', 'ACTIVE'),
    ('${ST.c}', '${T1}', 'S-7003', null, 'Santri Tanpa NIS', 'L', 'ACTIVE');
  insert into public.halaqahs (id, tenant_id, business_code, name, description, status) values
    ('${Halaqah}', '${T1}', 'H-777', 'Halaqah NIS', '-', 'ACTIVE');
  insert into public.halaqah_teachers (tenant_id, halaqah_id, teacher_id, is_primary) values
    ('${T1}', '${Halaqah}', (select id from public.teachers where tenant_id = '${T1}' limit 1), true);
  insert into public.halaqah_students (tenant_id, halaqah_id, student_id, joined_at) values
    ('${T1}', '${Halaqah}', '${ST.a}', now() - interval '2 months'),
    ('${T1}', '${Halaqah}', '${ST.b}', now() - interval '2 months'),
    ('${T1}', '${Halaqah}', '${ST.c}', now() - interval '2 months');
  grant usage on schema public to authenticated;
  grant select on all tables in schema public to authenticated;
`);

async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  return db.query(sql);
}

const isNisBased = (students) =>
  students.length === 3 &&
  students.every((s) => !String(s.code ?? "").startsWith("S-"));

// ---- 1. halaqah_detail (Presensi) -------------------------------------------
{
  const d = (await as(UGuru, `select public.halaqah_detail('${Halaqah}') as d`)).rows[0].d;
  const students = d.students;
  ok(students.length === 3, "halaqah_detail: 3 anggota halaqah");
  ok(isNisBased(students), "halaqah_detail: code = NIS lembaga (tanpa awalan S-)");
  ok(
    students[0].code === "999" && students[1].code === "1001" && students[2].code === null,
    "halaqah_detail: urut NIS alami (999 → 1001 → tanpa NIS di bawah)"
  );
}

// ---- 2. tahfidz_surahs_grid (Tahfidz) ---------------------------------------
{
  const g = (await as(UGuru, "select public.tahfidz_surahs_grid() as g")).rows[0].g;
  const students = g.students;
  ok(students.length === 3, "tahfidz_surahs_grid: 3 santri binaan");
  ok(isNisBased(students), "tahfidz_surahs_grid: code = NIS lembaga (tanpa awalan S-)");
  ok(
    students.find((s) => s.id === ST.c).code === null,
    "tahfidz_surahs_grid: santri tanpa NIS → null (UI menampilkan —)"
  );
}

// ---- 3. learning_grid DOA & HADITS ------------------------------------------
for (const mod of ["DOA", "HADITS"]) {
  const g = (await as(UGuru, `select public.learning_grid('${mod}') as g`)).rows[0].g;
  ok(g.students.length === 3, `learning_grid(${mod}): 3 santri`);
  ok(isNisBased(g.students), `learning_grid(${mod}): code = NIS lembaga (tanpa awalan S-)`);
  ok(
    g.students[0].code === "999" && g.students[2].code === null,
    `learning_grid(${mod}): urut NIS alami, tanpa NIS paling bawah`
  );
}

// ---- 4. tajwid_materi_grid ---------------------------------------------------
{
  const g = (await as(UGuru, "select public.tajwid_materi_grid() as g")).rows[0].g;
  ok(g.students.length === 3, "tajwid_materi_grid: 3 santri");
  ok(isNisBased(g.students), "tajwid_materi_grid: code = NIS lembaga (tanpa awalan S-)");
}

// ---- 5. tugas_halaqah_grid ---------------------------------------------------
{
  const g = (await as(UGuru, "select public.tugas_halaqah_grid() as g")).rows[0].g;
  ok(g.students.length === 3, "tugas_halaqah_grid: 3 santri");
  ok(isNisBased(g.students), "tugas_halaqah_grid: code = NIS lembaga (tanpa awalan S-)");
}

// ---- ringkasan ----------------------------------------------------------------
console.log(failed === 0 ? "\nSEMUA CEK LULUS ✅" : `\n${failed} CEK GAGAL ❌`);
process.exit(failed === 0 ? 0 : 1);
