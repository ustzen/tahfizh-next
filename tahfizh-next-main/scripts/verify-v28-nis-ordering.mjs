// Verifikasi migration V28 — kolom NIS + urutan NIS di RPC:
// halaqah_detail (Presensi), tahfidz_surahs_grid, learning_grid (Hadits/Doa),
// tajwid_materi_grid, tugas_halaqah_grid.
// Jalankan: node scripts/verify-v28-nis-ordering.mjs
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

async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  return db.query(sql);
}
const one = async (uid, sql) => (await as(uid, sql)).rows[0];

// ---- fixtures --------------------------------------------------------------
const TEN = "10000000-0000-0000-0000-000000000001";
const UG = "00000000-0000-0000-0000-0000000000a1"; // guru profile/auth uid
const TCH = "30000000-0000-0000-0000-000000000001"; // teacher row id
// Sengaja dibuat TIDAK berurutan abjad vs NIS: Zaid=NIS 005, Ahmad=NIS 020, Budi=NIS 012
const S = {
  zaid: "20000000-0000-0000-0000-000000000005", // NIS 005, nama "Zaid" (abjad terakhir, NIS pertama)
  ahmad: "20000000-0000-0000-0000-000000000020", // NIS 020
  budi: "20000000-0000-0000-0000-000000000012", // NIS 012
};

await db.exec(`
  insert into auth.users (id, email) values ('${UG}', 'guru@x.id');
  insert into public.tenants (id, business_code, name, kind, status) values
    ('${TEN}', 'T-001', 'Lembaga Uji', 'TPQ', 'ACTIVE');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${UG}', 'Guru Uji', 'USTADZ', '${TEN}');
  insert into public.teachers (id, tenant_id, full_name, business_code, gender) values
    ('${TCH}', '${TEN}', 'Guru Uji', 'G-001', 'L');
  insert into public.students (id, tenant_id, business_code, full_name, gender, status) values
    ('${S.zaid}', '${TEN}', '005', 'Zaid', 'L', 'ACTIVE'),
    ('${S.ahmad}', '${TEN}', '020', 'Ahmad', 'L', 'ACTIVE'),
    ('${S.budi}', '${TEN}', '012', 'Budi', 'L', 'ACTIVE');
  grant usage on schema public to authenticated;
  grant select on all tables in schema public to authenticated;
`);

// ---- 1. Presensi (halaqah_detail) — urut NIS, bukan abjad -------------------
const HAL = "40000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into public.halaqahs (id, tenant_id, business_code, name, status) values
    ('${HAL}', '${TEN}', 'H-001', 'Halaqah Uji', 'ACTIVE');
  insert into public.halaqah_teachers (tenant_id, halaqah_id, teacher_id, is_primary) values ('${TEN}', '${HAL}', '${TCH}', true);
  insert into public.halaqah_students (tenant_id, halaqah_id, student_id, joined_at) values
    ('${TEN}', '${HAL}', '${S.zaid}', now()), ('${TEN}', '${HAL}', '${S.ahmad}', now()), ('${TEN}', '${HAL}', '${S.budi}', now());
`);
const detail = (await one(UG, `select public.halaqah_detail('${HAL}') as j`)).j;
const presensiOrder = detail.students.map((s) => s.code);
ok(JSON.stringify(presensiOrder) === JSON.stringify(["005", "012", "020"]), `Presensi urut NIS naik (dapat ${presensiOrder.join(",")})`);
ok(detail.students.every((s) => "code" in s), "Presensi menyertakan kolom NIS (code)");

// ---- 2. Tahfidz grid (tahfidz_surahs_grid) — kolom NIS tersedia ------------
const grid = (await one(UG, "select public.tahfidz_surahs_grid() as j")).j;
ok(grid.students.every((s) => "code" in s), "Grid Tahfidz menyertakan kolom NIS (code)");
const gridCodes = new Set(grid.students.map((s) => s.code));
ok(gridCodes.has("005") && gridCodes.has("012") && gridCodes.has("020"), "Grid Tahfidz memuat NIS yang benar untuk tiap santri");

// ---- 3. Hadits/Doa (learning_grid) — urut NIS ------------------------------
const learn = (await one(UG, "select public.learning_grid('HADITS') as j")).j;
const learnOrder = learn.students.map((s) => s.code);
ok(JSON.stringify(learnOrder) === JSON.stringify(["005", "012", "020"]), `Hadits urut NIS naik (dapat ${learnOrder.join(",")})`);

const learnDoa = (await one(UG, "select public.learning_grid('DOA') as j")).j;
ok(
  JSON.stringify(learnDoa.students.map((s) => s.code)) === JSON.stringify(["005", "012", "020"]),
  "Doa Harian urut NIS naik"
);

// ---- 4. Tajwid (tajwid_materi_grid) — urut NIS -----------------------------
const tajwid = (await one(UG, "select public.tajwid_materi_grid() as j")).j;
const tajwidOrder = tajwid.students.map((s) => s.code);
ok(JSON.stringify(tajwidOrder) === JSON.stringify(["005", "012", "020"]), `Tajwid urut NIS naik (dapat ${tajwidOrder.join(",")})`);

// ---- 5. Tugas (tugas_halaqah_grid) — urut NIS ------------------------------
const tugas = (await one(UG, "select public.tugas_halaqah_grid() as j")).j;
const tugasOrder = tugas.students.map((s) => s.code);
ok(JSON.stringify(tugasOrder) === JSON.stringify(["005", "012", "020"]), `Tugas urut NIS naik (dapat ${tugasOrder.join(",")})`);
ok(tugas.students.every((s) => Array.isArray(s.halaqahIds)), "Tugas tetap menyertakan halaqahIds setelah penambahan NIS");

console.log(`\n${failed === 0 ? "SEMUA PEMERIKSAAN LULUS" : `${failed} PEMERIKSAAN GAGAL`}`);
process.exit(failed === 0 ? 0 : 1);
