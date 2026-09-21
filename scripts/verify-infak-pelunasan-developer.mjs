// Verifikasi fungsional migration V27 — pelunasan infak oleh DEVELOPER dan
// "dibayarkan atas nama" (20260921120000_tahfizh_v27_infak_pelunasan_developer.sql)
// di Postgres sungguhan (PGlite). Menjalankan SEMUA migration lalu menguji:
//   - payment_dev_arrears: daftar tunggakan semua lembaga, terlama dulu,
//     filter lembaga & pencarian, hanya untuk DEVELOPER
//   - payment_dev_settle: melunasi banyak santri × banyak bulan, satu
//     transaksi per lembaga, wajib menuliskan nama pembayar
//   - nama pembayar & tanggal tampil di riwayat/dasbor santri terkait
//   - tagihan lunas / menunggu pembayaran wali ditolak; p_force membatalkan
//   - wali membayarkan santri lain memakai "atas nama" (mis. Hamba Allah)
//
// Jalankan:  node scripts/verify-infak-pelunasan-developer.mjs
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

// ---- bootstrap -------------------------------------------------------------
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
// Migration V27 dijalankan dua kali → harus idempoten.
const latest = "20260921120000_tahfizh_v27_infak_pelunasan_developer.sql";
await db.exec(readFileSync(join(dir, latest), "utf8"));
console.log(`Migration selesai dimuat (${latest} dijalankan 2x — idempoten).\n`);

// ---- fixtures --------------------------------------------------------------
const U = {
  dev: "00000000-0000-0000-0000-0000000000d1",
  w1: "00000000-0000-0000-0000-0000000000b1",
  w2: "00000000-0000-0000-0000-0000000000b2",
  w4: "00000000-0000-0000-0000-0000000000b4",
};
const T = { t1: "10000000-0000-0000-0000-000000000001", t2: "10000000-0000-0000-0000-000000000002" };
const S = {
  s1: "20000000-0000-0000-0000-000000000001", // anak w1 (lembaga 1)
  s2: "20000000-0000-0000-0000-000000000002", // menunggak paling lama (lembaga 1)
  s3: "20000000-0000-0000-0000-000000000003", // menunggak (lembaga 1), tanpa wali
  s4: "20000000-0000-0000-0000-000000000004", // lembaga 2
};

await db.exec(`
  insert into auth.users (id, email) values
    ('${U.dev}', 'dev@x.id'), ('${U.w1}', 'w1@x.id'), ('${U.w2}', 'w2@x.id'), ('${U.w4}', 'w4@x.id');
  insert into public.tenants (id, business_code, name, kind, status) values
    ('${T.t1}', 'T-901', 'Lembaga Satu', 'TPQ', 'ACTIVE'),
    ('${T.t2}', 'T-902', 'Lembaga Dua', 'TPQ', 'ACTIVE');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${U.dev}', 'Developer', 'DEVELOPER', null),
    ('${U.w1}', 'Ahmad Pembayar', 'WALI_SANTRI', '${T.t1}'),
    ('${U.w2}', 'Budi Wali', 'WALI_SANTRI', '${T.t1}'),
    ('${U.w4}', 'Dedi Lain', 'WALI_SANTRI', '${T.t2}');
  insert into public.students (id, tenant_id, business_code, full_name, gender, status) values
    ('${S.s1}', '${T.t1}', 'S-9001', 'Santri Satu', 'L', 'ACTIVE'),
    ('${S.s2}', '${T.t1}', 'S-9002', 'Santri Dua', 'P', 'ACTIVE'),
    ('${S.s3}', '${T.t1}', 'S-9003', 'Santri Tiga', 'L', 'ACTIVE'),
    ('${S.s4}', '${T.t2}', 'S-9004', 'Santri Empat', 'L', 'ACTIVE');
  insert into public.guardians (tenant_id, profile_id) values
    ('${T.t1}', '${U.w1}'), ('${T.t1}', '${U.w2}'), ('${T.t2}', '${U.w4}')
  on conflict (profile_id) do nothing;
  insert into public.guardian_students (tenant_id, guardian_id, student_id)
  select '${T.t1}', g.id, '${S.s1}' from public.guardians g where g.profile_id = '${U.w1}'
  on conflict do nothing;
  insert into public.guardian_students (tenant_id, guardian_id, student_id)
  select '${T.t1}', g.id, '${S.s2}' from public.guardians g where g.profile_id = '${U.w2}'
  on conflict do nothing;
  insert into public.guardian_students (tenant_id, guardian_id, student_id)
  select '${T.t2}', g.id, '${S.s4}' from public.guardians g where g.profile_id = '${U.w4}'
  on conflict do nothing;
  grant usage on schema public to authenticated;
  grant select on all tables in schema public to authenticated;
`);

const today = (await db.query("select * from public.jakarta_today()")).rows[0];
const CUR = today.y * 12 + today.m;
const ym = (idx) => ({ y: Math.floor((idx - 1) / 12), m: ((idx - 1) % 12) + 1 });

/** Terbitkan tagihan UNPAID untuk santri pada indeks bulan tertentu. */
async function invoice(tenant, student, idx, amount = 1000) {
  const { y, m } = ym(idx);
  const ay = m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  await db.exec(`
    insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount, status)
    values ('${tenant}', '${student}', '${ay}', ${y}, ${m}, ${amount}, 'UNPAID')
    on conflict (tenant_id, student_id, academic_year, year, month) do nothing;
  `);
  return { y, m };
}

// s2 menunggak 4 bulan (paling lama), s1 menunggak 2 bulan, s3 1 bulan, s4 (lembaga 2) 2 bulan.
for (let k = 3; k >= 0; k--) await invoice(T.t1, S.s2, CUR - k);
for (let k = 1; k >= 0; k--) await invoice(T.t1, S.s1, CUR - k);
await invoice(T.t1, S.s3, CUR);
for (let k = 1; k >= 0; k--) await invoice(T.t2, S.s4, CUR - k);

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

const items = (arr) =>
  `'${JSON.stringify(arr).replace(/'/g, "''")}'::jsonb`;

// ---- 1. payment_dev_arrears ------------------------------------------------
const arrears = (await one(U.dev, "select public.payment_dev_arrears() as j")).j;
ok(arrears.students.length === 4, `daftar tunggakan berisi 4 santri (dapat ${arrears.students.length})`);
ok(arrears.students[0].studentId === S.s2, "santri dengan tunggakan PALING LAMA berada di urutan pertama");
ok(arrears.students[0].unpaidCount === 4, `santri teratas menunggak 4 bulan (dapat ${arrears.students[0].unpaidCount})`);
ok(arrears.students[0].unpaidTotal === 4000, "total tunggakan santri teratas dihitung benar");
ok(arrears.students.some((s) => s.tenantId === T.t2), "tunggakan lintas lembaga ikut terdaftar");
ok(arrears.tenants.length === 2, "daftar lembaga untuk filter tersedia");

const filtered = (await one(U.dev, `select public.payment_dev_arrears(null, '${T.t2}') as j`)).j;
ok(filtered.students.length === 1 && filtered.students[0].studentId === S.s4, "filter lembaga bekerja");

const searched = (await one(U.dev, "select public.payment_dev_arrears('S-9002') as j")).j;
ok(searched.students.length === 1 && searched.students[0].studentId === S.s2, "pencarian kode santri bekerja");

ok(await fails(U.w1, "select public.payment_dev_arrears()", "AKSES_DITOLAK"), "wali tidak dapat membaca daftar tunggakan platform");

// ---- 2. payment_dev_settle — validasi --------------------------------------
const oldest = ym(CUR - 3);
const settleOne = [{ studentId: S.s2, y: oldest.y, m: oldest.m }];

ok(
  await fails(U.dev, `select public.payment_dev_settle(${items(settleOne)}, '  ')`, "NAMA_PEMBAYAR_WAJIB"),
  "nama pembayar wajib diisi"
);
ok(
  await fails(U.w1, `select public.payment_dev_settle(${items(settleOne)}, 'Fulan')`, "AKSES_DITOLAK"),
  "hanya DEVELOPER yang dapat melunasi"
);
ok(
  await fails(U.dev, `select public.payment_dev_settle('[]'::jsonb, 'Fulan')`, "ITEM_KOSONG"),
  "tanpa tagihan terpilih ditolak"
);

// ---- 3. Pelunasan banyak santri × banyak bulan, 2 lembaga ------------------
const multi = [
  { studentId: S.s2, y: ym(CUR - 3).y, m: ym(CUR - 3).m },
  { studentId: S.s2, y: ym(CUR - 2).y, m: ym(CUR - 2).m },
  { studentId: S.s3, y: ym(CUR).y, m: ym(CUR).m, amount: 5000 },
  { studentId: S.s4, y: ym(CUR - 1).y, m: ym(CUR - 1).m },
];
const res = (await one(
  U.dev,
  `select public.payment_dev_settle(${items(multi)}, 'Bapak Ahmad Donatur', 'Tunai diterima di kantor') as j`
)).j;
ok(res.transactions === 2, `satu transaksi per lembaga (dapat ${res.transactions})`);
ok(res.invoices === 4, `4 tagihan dilunasi (dapat ${res.invoices})`);
ok(res.students === 3, `3 santri terbayar (dapat ${res.students})`);
ok(res.total === 8000, `total pelunasan Rp8.000 (dapat ${res.total})`);

const paid = await db.query(`
  select count(*)::int as n from public.payment_invoices
  where status = 'PAID' and paid_via = 'OFFLINE'
`);
ok(paid.rows[0].n === 4, "tagihan ditandai LUNAS dengan metode OFFLINE");

const txs = await db.query(`
  select method, status, payer_name, payer_alias, total_amount, confirmed_at, submitted_at
  from public.payment_transactions where method = 'OFFLINE' order by total_amount desc
`);
ok(txs.rows.length === 2 && txs.rows.every((t) => t.status === "PAID"), "transaksi pelunasan langsung berstatus LUNAS");
ok(
  txs.rows.every((t) => t.payer_alias === "Bapak Ahmad Donatur" && t.payer_name === "Developer"),
  "nama pembayar tercatat sebagai 'atas nama', identitas pencatat tetap tersimpan"
);
ok(txs.rows.every((t) => t.confirmed_at && t.submitted_at), "tanggal pelunasan tercatat");

// ---- 4. Tampil di riwayat santri -------------------------------------------
const hist = (await one(U.w2, "select public.payment_wali_history(24) as j")).j;
const s2Items = hist.find((c) => c.studentId === S.s2)?.items ?? [];
const s2Paid = s2Items.filter((i) => i.status === "PAID");
ok(s2Paid.length === 2, `riwayat santri tetap PER BULAN (dapat ${s2Paid.length} baris lunas)`);
ok(
  s2Paid.every((i) => i.paidByName === "Bapak Ahmad Donatur"),
  "riwayat menampilkan DIBAYARKAN OLEH siapa"
);
ok(s2Paid.every((i) => i.paidAt), "riwayat menampilkan tanggal dibayarkan");
ok(s2Paid.every((i) => i.paidBySelf === false && i.paidVia === "OFFLINE"), "pelunasan tidak dianggap 'dibayar sendiri'");

const notif = await db.query(`
  select count(*)::int as n from public.notifications
  where type = 'PAYMENT_CONFIRMED' and body like '%Bapak Ahmad Donatur%'
`);
ok(notif.rows[0].n >= 1, "wali santri menerima notifikasi pelunasan");

// ---- 5. Tagihan lunas & tagihan yang sedang diproses wali ------------------
ok(
  await fails(
    U.dev,
    `select public.payment_dev_settle(${items([{ studentId: S.s2, y: ym(CUR - 3).y, m: ym(CUR - 3).m }])}, 'Fulan')`,
    "SUDAH_LUNAS"
  ),
  "tagihan yang sudah lunas tidak dapat dilunasi ulang"
);

// Wali w1 memulai pembayaran untuk anaknya (s1) → tagihan jadi PENDING.
const curYm = ym(CUR);
await as(
  U.w1,
  `select public.payment_initiate(${items([{ studentId: S.s1, y: curYm.y, m: curYm.m, amount: 1000 }])}, 'MANUAL', 'Hamba Allah')`
);
ok(
  await fails(
    U.dev,
    `select public.payment_dev_settle(${items([{ studentId: S.s1, y: curYm.y, m: curYm.m }])}, 'Fulan')`,
    "MENUNGGU_PEMBAYARAN"
  ),
  "tagihan yang sedang diproses wali ditolak (cegah bayar ganda)"
);
const forced = (await one(
  U.dev,
  `select public.payment_dev_settle(${items([{ studentId: S.s1, y: curYm.y, m: curYm.m }])}, 'Panitia Infak', null, true) as j`
)).j;
ok(forced.cancelled === 1, "dengan p_force, transaksi wali yang bentrok dibatalkan");
const cancelled = await db.query(`
  select count(*)::int as n from public.payment_transactions where status = 'CANCELLED'
`);
ok(cancelled.rows[0].n === 1, "transaksi wali berstatus DIBATALKAN");

// ---- 6. Wali membayarkan santri lain dengan "atas nama" --------------------
const lastMonth = ym(CUR - 1);
const alias = (await one(
  U.w1,
  `select public.payment_initiate(${items([{ studentId: S.s2, y: lastMonth.y, m: lastMonth.m, amount: 1000 }])}, 'MANUAL', 'Hamba Allah') as j`
)).j;
ok(Boolean(alias.transaction_id), "wali dapat membayarkan santri lain di lembaga yang sama");
const aliasRow = await db.query(
  `select payer_name, payer_alias from public.payment_transactions where id = '${alias.transaction_id}'`
);
ok(
  aliasRow.rows[0].payer_alias === "Hamba Allah" && aliasRow.rows[0].payer_name === "Ahmad Pembayar",
  "infak 'Hamba Allah' menyamarkan nama ke santri tanpa menghapus jejak audit"
);
ok(
  await fails(
    U.w1,
    `select public.payment_initiate(${items([{ studentId: S.s3, y: curYm.y, m: curYm.m, amount: 1000 }])}, 'MANUAL', '${"x".repeat(61)}')`,
    "NAMA_TERLALU_PANJANG"
  ),
  "nama atas nama dibatasi 60 karakter"
);

console.log(`\n${failed === 0 ? "SEMUA PEMERIKSAAN LULUS" : `${failed} PEMERIKSAAN GAGAL`}`);
process.exit(failed === 0 ? 0 : 1);
