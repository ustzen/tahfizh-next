// Verifikasi V74: input nila Tartil massal — simpan, tanggal kertas, mode,
// cek per tanggal, dan update nilai yang sudah ada via assessment_id.
// File SQL gabungan dijalankan dulu (idempoten) sebelum uji.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

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

try {
  await db.exec(readFileSync("supabase/tahfizh-combined.sql", "utf8"));
  console.log("combined SQL: OK");
} catch (e) {
  console.error("combined SQL FAIL: " + String(e?.message ?? e).split("\n")[0]);
  process.exit(1);
}

// --- seed lembaga uji: 1 ustadz + 1 halaqah + 3 santri + grade huruf ---------
const uid = "11111111-1111-1111-1111-111111111111";
const sid = (n) => `22222222-2222-2222-2222-22222222222${n}`;
await db.exec(`insert into auth.users (id, email) values ('${uid}', 'ustadz@uji.id')`);
await db.exec(`insert into public.tenants (business_code, name) values ('T-UJI-TARTIL', 'Lembaga Uji Tartil')`);
const [tenant] = await q(`select id from public.tenants where business_code = 'T-UJI-TARTIL' limit 1`);
await db.exec(`insert into public.profiles (id, full_name, role, tenant_id) values ('${uid}', 'Ustadz Uji', 'USTADZ', '${tenant.id}')`);
await db.exec(`insert into public.teachers (tenant_id, business_code, full_name, gender, profile_id) values ('${tenant.id}', 'G-UJI-1', 'Ustadz Uji', 'L', '${uid}')`);
const [teacher] = await q(`select id from public.teachers where profile_id = '${uid}'`);
await db.exec(`insert into public.halaqahs (tenant_id, business_code, name) values ('${tenant.id}', 'H-UJI-1', 'Halaqah Uji Tartil')`);
const [halaqah] = await q(`select id from public.halaqahs where business_code = 'H-UJI-1'`);
await db.exec(`insert into public.halaqah_teachers (tenant_id, halaqah_id, teacher_id, is_primary) values ('${tenant.id}', '${halaqah.id}', '${teacher.id}', true)`);
for (const n of [1, 2, 3]) {
  await db.exec(`insert into public.students (id, tenant_id, business_code, full_name, gender) values ('${sid(n)}', '${tenant.id}', 'S-UJI-${n}', 'Santri Uji ${n}', 'L')`);
  await db.exec(`insert into public.halaqah_students (tenant_id, halaqah_id, student_id) values ('${tenant.id}', '${halaqah.id}', '${sid(n)}')`);
}
await db.exec(`insert into public.tahfidz_grade_settings (tenant_id, label, min_value, max_value, sort_order) values ('${tenant.id}', 'Baik', 75, 90, 1), ('${tenant.id}', 'Cukup', 60, 74, 2)`);
await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${uid}'::uuid; $$;`);

// --- helper: bentuk panggilan persis seperti server action Next.js ----------
const [matJilid1, matJilid2] = await q(`select id, name from public.tartil_materials where tenant_id = '${tenant.id}' and is_active order by sort_order limit 2`);

const bulk = (items, assessedAt) =>
  db.query(`select * from public.tartil_save_assessments_bulk($1::jsonb, ${assessedAt ? "$2::timestamptz" : "null::timestamptz"})`, assessedAt ? [JSON.stringify(items), `${assessedAt}T00:00:00+00:00`] : [JSON.stringify(items)]);

let failed = false;
const fail = (msg) => { failed = true; console.error("  ✗ " + msg); };

// Tes A — persis payload client (CENTANG, hari ini: p_assessed_at = null).
const itemsA = [1, 2, 3].map((n) => ({
  student_id: sid(n), material_id: matJilid1.id, pages_label: "5-10",
  status: "DINILAI", score_value: null, score_label: null, free_note: null,
}));
try {
  await bulk(itemsA);
  const r = await q(`select student_id, pages_label, status, score_label from public.tartil_assessments`);
  if (r.length === 3 && r.every((x) => x.status === "DINILAI" && x.score_label === null && x.pages_label === "5-10")) {
    console.log("Tes A (massal CENTANG, hari ini): OK — 3 baris tersimpan.");
  } else fail("Tes A hasil salah: " + JSON.stringify(r));
} catch (e) {
  fail("Tes A massal CENTANG gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes B — batch tanggal lampau (nilai kertas lama): assessed_at mengikuti kertas.
try {
  const gotDate = (await q(`select to_char(current_date - 7, 'YYYY-MM-DD') as d`))[0].d;
  await bulk([{ student_id: sid(1), material_id: matJilid2.id, pages_label: "1-4", status: "DINILAI", score_value: null, score_label: null, free_note: null }], gotDate);
  const r = await q(`select to_char((assessed_at at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') d from public.tartil_assessments where material_id = '${matJilid2.id}'`);
  if (r.length === 1 && r[0].d === gotDate) console.log(`Tes B (massal tanggal lampau ${gotDate}): OK — assessed_at sesuai kertas.`);
  else fail("Tes B assessed_at salah: " + JSON.stringify(r));
} catch (e) {
  fail("Tes B tanggal lampau gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes C — HURUF: label tersimpan apa adanya (mode-agnostic, validasi grade lembaga).
try {
  await bulk([{ student_id: sid(2), material_id: matJilid2.id, pages_label: "2", status: "DINILAI", score_value: null, score_label: "Baik", free_note: null }]);
  const r = await q(`select score_label from public.tartil_assessments where student_id = '${sid(2)}' and material_id = '${matJilid2.id}'`);
  if (r[0]?.score_label === "BAIK") console.log("Tes C (massal HURUF): OK — label tersimpan apa adanya.");
  else fail("Tes C hasil salah: " + JSON.stringify(r));
} catch (e) {
  fail("Tes C HURUF gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes D — ANGKA: angka 1-100 tersimpan.
try {
  await bulk([{ student_id: sid(3), material_id: matJilid2.id, pages_label: "3", status: "DINILAI", score_value: 85, score_label: null, free_note: null }]);
  const r = await q(`select score_value from public.tartil_assessments where student_id = '${sid(3)}' and material_id = '${matJilid2.id}'`);
  if (r[0]?.score_value === 85) console.log("Tes D (massal ANGKA): OK — angka tersimpan.");
  else fail("Tes D hasil salah: " + JSON.stringify(r));
} catch (e) {
  fail("Tes D ANGKA gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes E — RPC cek penilaian per tanggal (dipakai prefill form massal & jurnal).
try {
  const d = (await q(`select to_char(current_date, 'YYYY-MM-DD') as d`))[0].d;
  const onDate = await db.query(`select * from public.tartil_assessments_on_date($1::date)`, [d]);
  if (onDate.rows.length >= 3) console.log(`Tes E (cek per tanggal ${d}): OK — ${onDate.rows.length} entri terlihat guru.`);
  else fail("Tes E entri kurang: " + JSON.stringify(onDate.rows));
} catch (e) {
  fail("Tes E on_date gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes F — update nilai yang sudah ada (form prefilled mengirim assessment_id):
// baris lama harus ter-UPDATE, bukan muncul duplikat di riwayat.
try {
  const [first] = await q(`select id from public.tartil_assessments where student_id = '${sid(1)}' and material_id = '${matJilid1.id}' order by assessed_at desc limit 1`);
  await bulk([{ student_id: sid(1), material_id: matJilid1.id, pages_label: "5-10", status: "DINILAI", score_value: null, score_label: "Cukup", free_note: null, assessment_id: first.id }]);
  const updated = await q(`select score_label, score_value from public.tartil_assessments where id = '${first.id}'`);
  const totalRows = (await q(`select count(*)::int c from public.tartil_assessments where student_id = '${sid(1)}' and material_id = '${matJilid1.id}'`))[0].c;
  if (totalRows === 1 && updated[0]?.score_label === "CUKUP" && updated[0]?.score_value === null) console.log("Tes F (update nilai via assessment_id): OK — baris di-update, bukan duplikat.");
  else fail(`Tes F hasil salah — harus UPDATE baris lama: rows=${totalRows} val=${JSON.stringify(updated)}`);
} catch (e) {
  fail("Tes F update gagal: " + String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
}

// Tes G — validasi grade HURUF tetap menolak label yang bukan milik lembaga.
try {
  await bulk([{ student_id: sid(2), material_id: matJilid1.id, pages_label: "1", status: "DINILAI", score_value: null, score_label: "A+" }]);
  fail("Tes G seharusnya ditolak (GRADE_TIDAK_VALID).");
} catch (e) {
  if (String(e?.message ?? e).includes("GRADE_TIDAK_VALID")) console.log("Tes G (grade bukan milik lembaga): OK — ditolak GRADE_TIDAK_VALID.");
  else fail("Tes G error tidak sesuai: " + String(e?.message ?? e).split("\n")[0]);
}

await db.close();
if (failed) process.exit(1);
console.log("HASIL: PASS");
