// Verifikasi fungsional migration Infak Pengembangan level platform
// (20260920000000_tahfizh_v12_infak_developer_platform.sql) di Postgres
// sungguhan (PGlite). Menjalankan SEMUA migration lalu menguji skenario:
//   - pengaturan platform hanya bisa disimpan Developer, minimal Rp1.000
//   - tagihan dibuat untuk semua santri aktif di semua lembaga aktif (idempoten)
//   - fallback tagihan saat wali membuka aplikasi + gate tanggal 16
//   - bukti transfer → notifikasi Developer; konfirmasi hanya Developer
//   - RLS: Admin lembaga tidak bisa membaca data infak
//
// Jalankan:  node scripts/verify-infak-platform.mjs
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

// ---- bootstrap (sama dengan sql-parse-check.mjs) ---------------------------
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

// ---- fixtures --------------------------------------------------------------
const U = {
  dev: "00000000-0000-0000-0000-0000000000d1",
  admin: "00000000-0000-0000-0000-0000000000a1",
  wali: "00000000-0000-0000-0000-0000000000b1",
};
const T = { t1: "10000000-0000-0000-0000-000000000001", t2: "10000000-0000-0000-0000-000000000002", t3: "10000000-0000-0000-0000-000000000003" };

await db.exec(`
  insert into auth.users (id, email) values
    ('${U.dev}', 'dev@x.id'), ('${U.admin}', 'admin@x.id'), ('${U.wali}', 'wali@x.id');
  insert into public.tenants (id, business_code, name, kind, status) values
    ('${T.t1}', 'T-901', 'Lembaga Satu', 'TPQ', 'ACTIVE'),
    ('${T.t2}', 'T-902', 'Lembaga Dua', 'TPQ', 'ACTIVE'),
    ('${T.t3}', 'T-903', 'Lembaga Nonaktif', 'TPQ', 'INACTIVE');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${U.dev}', 'Developer', 'DEVELOPER', null),
    ('${U.admin}', 'Admin Satu', 'ADMIN', '${T.t1}'),
    ('${U.wali}', 'Wali Satu', 'WALI_SANTRI', '${T.t1}');
  insert into public.students (id, tenant_id, business_code, full_name, gender, status) values
    ('20000000-0000-0000-0000-000000000001', '${T.t1}', 'S-9001', 'Santri A', 'L', 'ACTIVE'),
    ('20000000-0000-0000-0000-000000000002', '${T.t1}', 'S-9002', 'Santri B', 'P', 'ACTIVE'),
    ('20000000-0000-0000-0000-000000000003', '${T.t1}', 'S-9003', 'Santri Nonaktif', 'L', 'INACTIVE'),
    ('20000000-0000-0000-0000-000000000004', '${T.t2}', 'S-9004', 'Santri C', 'L', 'ACTIVE'),
    ('20000000-0000-0000-0000-000000000005', '${T.t3}', 'S-9005', 'Santri D', 'L', 'ACTIVE');
  insert into public.guardians (id, tenant_id, profile_id) values
    ('30000000-0000-0000-0000-000000000001', '${T.t1}', '${U.wali}');
  insert into public.guardian_students (tenant_id, guardian_id, student_id) values
    ('${T.t1}', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
  grant usage on schema public to authenticated;
  grant select on all tables in schema public to authenticated;
`);

async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  return db.query(sql);
}
async function fails(uid, sql, code) {
  try {
    await as(uid, sql);
    return false;
  } catch (e) {
    return String(e.message).includes(code);
  }
}
const one = async (uid, sql) => (await as(uid, sql)).rows[0];

// ---- 1. pengaturan platform -------------------------------------------------
ok(await fails(U.admin, "select public.payment_settings_save(2000)", "AKSES_DITOLAK"), "Admin lembaga TIDAK bisa menyimpan pengaturan infak");
ok(await fails(U.dev, "select public.payment_settings_save(500)", "NOMINAL_MINIMAL"), "Nominal < Rp1.000 ditolak");
await as(U.dev, "select public.payment_settings_save(2000, 'BSI', '7123', 'TAHFIZH', null, 'Transfer ya', null, 3)");
const s = (await one(U.wali, "select public.payment_settings_get() as s")).s;
ok(s.default_amount === 2000 && s.bank_name === "BSI", "Pengaturan platform tersimpan & terbaca wali");

// ---- 2. generate tagihan semua lembaga --------------------------------------
ok(await fails(U.admin, "select public.invoice_ensure_month()", "AKSES_DITOLAK"), "Admin lembaga TIDAK bisa membuat tagihan");
const gen = (await one(U.dev, "select public.invoice_ensure_month() as n")).n;
ok(gen === 3, `Tagihan = 3 (2 santri aktif T1 + 1 aktif T2; santri nonaktif & lembaga nonaktif dilewati) — dapat ${gen}`);
const gen2 = (await one(U.dev, "select public.invoice_ensure_month() as n")).n;
ok(gen2 === 0, "Generate ulang idempoten (0 tagihan baru)");
const amt = await one(U.dev, "select count(*)::int as n, count(*) filter (where amount = 2000)::int as n2000 from public.payment_invoices");
ok(amt.n === 3 && amt.n2000 === 3, "Nominal semua tagihan mengikuti nominal platform (Rp2.000)");
const priv = (await one(U.dev, "select has_function_privilege('authenticated', 'public.invoice_generate_all(integer,integer)', 'execute') as p")).p;
ok(priv === false, "invoice_generate_all tidak bisa dipanggil user login (internal/cron)");

// ---- 3. fallback + gate ------------------------------------------------------
await db.exec("delete from public.payment_invoices");
const gate = (await one(U.wali, "select public.wali_payment_gate() as g")).g;
const cnt = (await one(U.dev, "select count(*)::int as n from public.payment_invoices")).n;
ok(cnt === 1, `Wali membuka app → hanya tagihan anaknya dibuat otomatis (${cnt})`);
ok(gate.applicable === true && gate.unpaid_count === 1 && gate.min_amount === 2000, "Gate membaca nominal platform & tagihan belum lunas");
ok(gate.locked === (gate.day >= 16), `Gate terkunci mulai tanggal 16 (hari ini tgl ${gate.day} → locked=${gate.locked})`);
await as(U.dev, "select public.invoice_ensure_month()");

// ---- 4. pembayaran → Developer ----------------------------------------------
const tx = (await one(U.wali, `select public.payment_initiate(
  '[{"studentId":"20000000-0000-0000-0000-000000000001","y":${new Date().getFullYear()},"m":${new Date().getMonth() + 1},"amount":2000}]'::jsonb, 'MANUAL') as r`)).r;
ok(!!tx.transaction_id, "Wali membuat pembayaran manual");
await as(U.wali, `select public.payment_submit_proof('${tx.transaction_id}', '${T.t1}/proof-x.jpg', 'ok')`);
const nDev = (await one(U.dev, `select count(*)::int as n from public.notifications where user_id = '${U.dev}' and type = 'PAYMENT_SUBMITTED'`)).n;
const nAdm = (await one(U.admin, `select count(*)::int as n from public.notifications where user_id = '${U.admin}'`)).n;
ok(nDev === 1 && nAdm === 0, "Bukti transfer → notifikasi ke Developer (bukan Admin lembaga)");

ok(await fails(U.admin, `select public.payment_dev_confirm('${tx.transaction_id}', 'APPROVE')`, "AKSES_DITOLAK"), "Admin lembaga TIDAK bisa mengonfirmasi");
const listAdmin = (await as(U.admin, "select * from public.payment_dev_list('ALL', null)")).rows.length;
const listDev = (await as(U.dev, "select * from public.payment_dev_list('WAITING_CONFIRM', 'Lembaga Satu')")).rows;
ok(listAdmin === 0 && listDev.length === 1 && listDev[0].tenant_name === "Lembaga Satu", "Daftar transaksi: Developer melihat lintas lembaga, Admin kosong");

await as(U.dev, `select public.payment_dev_confirm('${tx.transaction_id}', 'APPROVE')`);
const paid = (await one(U.dev, "select count(*)::int as n from public.payment_invoices where status = 'PAID'")).n;
ok(paid === 1, "Konfirmasi Developer → tagihan LUNAS");
const gate2 = (await one(U.wali, "select public.wali_payment_gate() as g")).g;
ok(gate2.locked === false && gate2.unpaid_count === 0, "Setelah lunas → akses wali terbuka");
const sum = (await one(U.dev, "select public.payment_dev_summary() as s")).s;
ok(sum.paidCount === 1 && sum.collectedTotal === 2000 && sum.totalInvoices === 3, "Ringkasan platform benar (3 tagihan, 1 lunas, Rp2.000)");
const tenants = (await one(U.dev, "select public.payment_dev_tenants() as t")).t;
ok(Array.isArray(tenants) && tenants.length === 2, "Rincian per lembaga hanya lembaga aktif");

// ---- 5. RLS -------------------------------------------------------------------
async function rlsCount(uid, table) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec("set role authenticated");
  try {
    return (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
  } finally {
    await db.exec("reset role");
  }
}
ok((await rlsCount(U.admin, "payment_invoices")) === 0, "RLS: Admin lembaga tidak bisa membaca tagihan");
ok((await rlsCount(U.admin, "payment_transactions")) === 0, "RLS: Admin lembaga tidak bisa membaca transaksi");
ok((await rlsCount(U.dev, "payment_invoices")) === 3, "RLS: Developer membaca semua tagihan");
ok((await rlsCount(U.wali, "payment_invoices")) === 1, "RLS: Wali hanya membaca tagihan anaknya");

await db.close();
console.log(failed ? `\n${failed} pemeriksaan GAGAL` : "\nSemua pemeriksaan LULUS");
process.exit(failed ? 1 : 0);
