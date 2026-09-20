// Verifikasi fungsional migration Infak: bayarkan santri lain, beberapa bulan
// sekaligus, dan riwayat per bulan
// (20260920100000_tahfizh_v12_infak_bayar_untuk_lain_multi_bulan.sql)
// di Postgres sungguhan (PGlite). Menjalankan SEMUA migration lalu menguji:
//   - daftar santri lain diurutkan dari yang menunggak paling lama
//   - wali membayar banyak santri × banyak bulan dalam SATU transaksi
//   - lintas lembaga / item ganda / nominal kurang / bayar ganda ditolak
//   - bayar di muka (bulan depan dibuat otomatis, maksimal 11 bulan ke depan)
//   - riwayat tetap per bulan + tanggal + siapa yang membayarkan
//   - pembayaran otomatis (webhook) & pengamanan RPC webhook
//
// Jalankan:  node scripts/verify-infak-bayar-bersama.mjs
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

// ---- bootstrap (sama dengan verify-infak-platform.mjs) ---------------------
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
// Jalankan ulang migration infak terbaru → harus idempoten.
const rerun = readdirSync(dir).filter((x) => x.endsWith(".sql") && x >= "20260920100000").sort();
for (const f of rerun) await db.exec(readFileSync(join(dir, f), "utf8"));
console.log(`Migration selesai dimuat (${rerun.join(", ")} dijalankan 2x — idempoten).\n`);

// ---- fixtures --------------------------------------------------------------
const U = {
  dev: "00000000-0000-0000-0000-0000000000d1",
  w1: "00000000-0000-0000-0000-0000000000b1", // pembayar, anak: S1
  w2: "00000000-0000-0000-0000-0000000000b2", // wali S2
  w3: "00000000-0000-0000-0000-0000000000b3", // wali S3
  w4: "00000000-0000-0000-0000-0000000000b4", // wali lembaga lain
};
const T = { t1: "10000000-0000-0000-0000-000000000001", t2: "10000000-0000-0000-0000-000000000002" };
const S = {
  s1: "20000000-0000-0000-0000-000000000001", // anak W1
  s2: "20000000-0000-0000-0000-000000000002", // menunggak sejak cur-3 (4 bulan)
  s3: "20000000-0000-0000-0000-000000000003", // menunggak sejak cur-1 (2 bulan)
  s5: "20000000-0000-0000-0000-000000000005", // menunggak sejak cur-5 (6 bulan) → paling lama
  s6: "20000000-0000-0000-0000-000000000006", // menunggak sejak cur-3 (2 bulan saja) → sama tertua dengan s2, bulan lebih sedikit
  s7: "20000000-0000-0000-0000-000000000007", // NONAKTIF, menunggak
  s8: "20000000-0000-0000-0000-000000000008", // lunas semua → tidak tampil
  s4: "20000000-0000-0000-0000-000000000004", // lembaga lain
};
const G = (n) => `30000000-0000-0000-0000-00000000000${n}`;

await db.exec(`
  insert into auth.users (id, email) values
    ('${U.dev}', 'dev@x.id'), ('${U.w1}', 'w1@x.id'), ('${U.w2}', 'w2@x.id'),
    ('${U.w3}', 'w3@x.id'), ('${U.w4}', 'w4@x.id');
  insert into public.tenants (id, business_code, name, kind, status) values
    ('${T.t1}', 'T-901', 'Lembaga Satu', 'TPQ', 'ACTIVE'),
    ('${T.t2}', 'T-902', 'Lembaga Dua', 'TPQ', 'ACTIVE');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${U.dev}', 'Developer', 'DEVELOPER', null),
    ('${U.w1}', 'Ahmad Pembayar', 'WALI_SANTRI', '${T.t1}'),
    ('${U.w2}', 'Budi Wali', 'WALI_SANTRI', '${T.t1}'),
    ('${U.w3}', 'Citra Wali', 'WALI_SANTRI', '${T.t1}'),
    ('${U.w4}', 'Dedi Lain', 'WALI_SANTRI', '${T.t2}');
  insert into public.students (id, tenant_id, business_code, full_name, gender, status) values
    ('${S.s1}', '${T.t1}', 'S-9001', 'Santri Satu', 'L', 'ACTIVE'),
    ('${S.s2}', '${T.t1}', 'S-9002', 'Santri Dua', 'P', 'ACTIVE'),
    ('${S.s3}', '${T.t1}', 'S-9003', 'Santri Tiga', 'L', 'ACTIVE'),
    ('${S.s4}', '${T.t2}', 'S-9004', 'Santri Empat', 'L', 'ACTIVE'),
    ('${S.s5}', '${T.t1}', 'S-9005', 'Santri Lima', 'P', 'ACTIVE'),
    ('${S.s6}', '${T.t1}', 'S-9006', 'Santri Enam', 'L', 'ACTIVE'),
    ('${S.s7}', '${T.t1}', 'S-9007', 'Santri Nonaktif', 'L', 'INACTIVE'),
    ('${S.s8}', '${T.t1}', 'S-9008', 'Santri Lunas', 'L', 'ACTIVE');
  insert into public.guardians (id, tenant_id, profile_id) values
    ('${G(1)}', '${T.t1}', '${U.w1}'), ('${G(2)}', '${T.t1}', '${U.w2}'),
    ('${G(3)}', '${T.t1}', '${U.w3}'), ('${G(4)}', '${T.t2}', '${U.w4}');
  insert into public.guardian_students (tenant_id, guardian_id, student_id) values
    ('${T.t1}', '${G(1)}', '${S.s1}'), ('${T.t1}', '${G(2)}', '${S.s2}'),
    ('${T.t1}', '${G(3)}', '${S.s3}'), ('${T.t2}', '${G(4)}', '${S.s4}');
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

// ---- "hari ini" versi Jakarta + util bulan ------------------------------------
const today = (await one(U.dev, "select y, m from public.jakarta_today()"));
const CUR = today.y * 12 + today.m;
const ym = (idx) => ({ y: Math.floor((idx - 1) / 12), m: ((idx - 1) % 12) + 1 });
const ay = ({ y, m }) => (m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`);
const item = (sid, idx, amount = 1000) => ({ studentId: sid, ...ym(idx), amount });
const pay = (uid, items, method = "MANUAL") =>
  one(uid, `select public.payment_initiate('${JSON.stringify(items)}'::jsonb, '${method}') as r`).then((x) => x.r);

async function seedInvoices(studentId, tenantId, fromIdx, toIdx, status = "UNPAID") {
  for (let idx = fromIdx; idx <= toIdx; idx++) {
    const p = ym(idx);
    await db.exec(`insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount, status)
      values ('${tenantId}', '${studentId}', '${ay(p)}', ${p.y}, ${p.m}, 1000, '${status}')
      on conflict do nothing`);
  }
}
await seedInvoices(S.s2, T.t1, CUR - 3, CUR); // 4 bulan
await seedInvoices(S.s3, T.t1, CUR - 1, CUR); // 2 bulan
await seedInvoices(S.s5, T.t1, CUR - 5, CUR); // 6 bulan → tertua
await seedInvoices(S.s6, T.t1, CUR - 3, CUR - 2); // 2 bulan, tertua sama dgn s2
await seedInvoices(S.s7, T.t1, CUR - 4, CUR); // nonaktif
await seedInvoices(S.s8, T.t1, CUR - 2, CUR, "PAID"); // lunas
await seedInvoices(S.s4, T.t2, CUR - 6, CUR); // lembaga lain

// ---- 1. daftar santri lain diurutkan dari yang menunggak paling lama -----------
const inv1 = (await one(U.w1, "select public.payment_wali_invoices() as r")).r;
const names = inv1.others.map((o) => o.name);
ok(
  JSON.stringify(names) === JSON.stringify(["Santri Lima", "Santri Dua", "Santri Enam", "Santri Tiga"]),
  `Urutan terlama menunggak: Lima(6 bln) → Dua(4 bln) → Enam(2 bln, tertua sama) → Tiga — dapat ${names.join(", ")}`
);
ok(!names.includes("Santri Satu"), "Anak sendiri tidak muncul di daftar santri lain");
ok(!names.includes("Santri Empat"), "Santri lembaga lain tidak muncul");
ok(!names.includes("Santri Nonaktif") && !names.includes("Santri Lunas"), "Santri nonaktif / sudah lunas tidak muncul");
const lima = inv1.others[0];
ok(lima.unpaidCount === 6 && lima.unpaidTotal === 6000 && lima.oldestY === ym(CUR - 5).y && lima.oldestM === ym(CUR - 5).m,
  "Ringkasan tunggakan (jumlah bulan, total, bulan tertua) benar");
ok(lima.invoices.length === 6 && lima.invoices[0].m === ym(CUR - 5).m, "Bulan tunggakan tiap santri terurut dari yang tertua");
ok(inv1.children.length === 1 && inv1.children[0].ahead.length === 11 && inv1.children[0].ahead[0].status === "NONE",
  "Anak sendiri: 11 bulan ke depan tersedia untuk bayar di muka (status NONE = belum ada tagihan)");

// ---- 2. banyak santri × banyak bulan dalam SATU transaksi -------------------------
const bigItems = [
  ...[CUR - 3, CUR - 2, CUR - 1, CUR].map((i) => item(S.s2, i)),
  ...[CUR - 1, CUR].map((i) => item(S.s3, i, 2000)), // infak lebih dari tagihan (sukarela)
];
const tx = await pay(U.w1, bigItems);
ok(tx.items === 6 && tx.total === 4 * 1000 + 2 * 2000, `Satu transaksi menutup 2 santri × banyak bulan (total Rp${tx.total})`);
const alloc = (await one(U.dev, `select count(*)::int as n from public.payment_allocations where transaction_id = '${tx.transaction_id}'`)).n;
ok(alloc === 6, "Alokasi tercatat PER BULAN (6 baris)");
const pend = (await one(U.dev, `select count(*)::int as n from public.payment_invoices where status = 'PENDING'`)).n;
ok(pend === 6, "Ke-6 tagihan berstatus PENDING selama transaksi berjalan");

// ---- 3. penolakan ------------------------------------------------------------------
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s4, CUR)])}'::jsonb, 'MANUAL')`, "SANTRI_TIDAK_DITEMUKAN"),
  "Membayarkan santri LEMBAGA LAIN ditolak");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s7, CUR)])}'::jsonb, 'MANUAL')`, "SANTRI_TIDAK_DITEMUKAN"),
  "Santri nonaktif ditolak");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s5, CUR), item(S.s5, CUR)])}'::jsonb, 'MANUAL')`, "ITEM_GANDA"),
  "Item ganda (santri+bulan sama) ditolak");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s2, CUR)])}'::jsonb, 'MANUAL')`, "MENUNGGU_PEMBAYARAN"),
  "Tagihan yang sedang diproses transaksi lain tidak bisa dibayar ganda");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s5, CUR, 500)])}'::jsonb, 'MANUAL')`, "NOMINAL_MINIMAL"),
  "Nominal di bawah Rp1.000 ditolak");
ok(await fails(U.w1, `select public.payment_initiate('[]'::jsonb, 'MANUAL')`, "ITEM_KOSONG"), "Daftar kosong ditolak");
const many = Array.from({ length: 121 }, (_, k) => ({ studentId: S.s5, y: 2020 + Math.floor(k / 12), m: (k % 12) + 1, amount: 1000 }));
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify(many)}'::jsonb, 'MANUAL')`, "ITEM_TERLALU_BANYAK"),
  "Lebih dari 120 item dalam satu pembayaran ditolak");
// Nominal platform naik → tagihan bulan depan yang dibuat saat bayar di muka memakai nominal baru.
await as(U.dev, "select public.payment_settings_save(2000)");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s8, CUR + 2, 1000)])}'::jsonb, 'MANUAL')`, "NOMINAL_KURANG"),
  "Tagihan di muka baru mengikuti nominal platform (Rp2.000) → Rp1.000 ditolak");
const rolled = (await one(U.dev, `select count(*)::int as n from public.payment_invoices where student_id = '${S.s8}' and year * 12 + month = ${CUR + 2}`)).n;
ok(rolled === 0, "Pembayaran gagal tidak meninggalkan tagihan setengah jadi (rollback)");
await as(U.dev, "select public.payment_settings_save(1000)");

// ---- 4. bayar di muka (bulan depan) -----------------------------------------------
const adv = await pay(U.w1, [1, 2, 3].map((k) => item(S.s1, CUR + k)));
ok(adv.items === 3, "Bayar di muka 3 bulan ke depan untuk anak sendiri");
const created = (await one(U.dev, `select count(*)::int as n from public.payment_invoices where student_id = '${S.s1}' and year * 12 + month > ${CUR}`)).n;
ok(created === 3, "Tagihan bulan depan dibuat otomatis saat dibayar di muka");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s1, CUR + 12)])}'::jsonb, 'MANUAL')`, "BULAN_DI_LUAR_BATAS"),
  "Bayar di muka lebih dari 11 bulan ke depan ditolak");
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s1, CUR - 30)])}'::jsonb, 'MANUAL')`, "TAGIHAN_TIDAK_DITEMUKAN"),
  "Bulan lampau yang tak pernah ditagih tidak bisa dibuat");
const inv2 = (await one(U.w1, "select public.payment_wali_invoices() as r")).r;
ok(inv2.children[0].ahead.filter((a) => a.status === "PENDING").length === 3, "Daftar 'ahead' menandai bulan yang sedang diproses");

// ---- 5. konfirmasi Developer → LUNAS + riwayat per bulan -------------------------------
for (const t of [tx, adv]) {
  await as(U.w1, `select public.payment_submit_proof('${t.transaction_id}', '${T.t1}/proof-${t.reference}.jpg', 'ok')`);
  await as(U.dev, `select public.payment_dev_confirm('${t.transaction_id}', 'APPROVE')`);
}
const st2 = (await one(U.w2, "select public.payment_wali_status() as r")).r;
ok(st2.length === 1 && st2[0].status === "PAID" && st2[0].paidByName === "Ahmad Pembayar" && st2[0].paidBySelf === false && !!st2[0].paidAt,
  "Dasbor santri yang dibayarkan: infak DIBAYARKAN OLEH Ahmad Pembayar + tanggal");
ok(st2[0].bundleMonths === 4, "Dasbor menandai dibayar sekaligus 4 bulan");
const hist2 = (await one(U.w2, "select public.payment_wali_history(12) as r")).r;
const rows2 = hist2[0].items;
ok(rows2.length >= 4 && rows2.slice(0, 4).every((r) => r.status === "PAID"), "Riwayat tetap PER BULAN: 4 baris terpisah untuk 4 bulan");
ok(rows2.slice(0, 4).every((r) => r.paidByName === "Ahmad Pembayar" && !!r.paidAt && r.bundleMonths === 4 && r.paidInAdvance === false),
  "Tiap baris bulan memuat tanggal dibayarkan, pembayar, & 'sekaligus 4 bulan'");
ok(rows2[0].y === today.y && rows2[0].m === today.m, "Riwayat terurut dari bulan terbaru");
const st3 = (await one(U.w3, "select public.payment_wali_status() as r")).r;
ok(st3[0].status === "PAID" && st3[0].paidByName === "Ahmad Pembayar", "Santri lain (S3) yang dibayarkan juga lunas & tercatat pembayarnya");
const hist3 = (await one(U.w3, "select public.payment_wali_history(12) as r")).r[0].items;
ok(hist3.slice(0, 2).every((r) => r.amount === 2000), "Nominal infak sukarela (Rp2.000) tercatat di riwayat");
const hist1 = (await one(U.w1, "select public.payment_wali_history(12) as r")).r[0].items;
const advRows = hist1.filter((r) => r.y * 12 + r.m > CUR);
ok(advRows.length === 3 && advRows.every((r) => r.status === "PAID" && r.paidInAdvance === true && r.paidBySelf === true && r.bundleMonths === 3),
  "Bayar di muka: 3 baris per bulan, ditandai 'di muka', dibayar sendiri, sekaligus 3 bulan");
ok(!(await one(U.w2, "select public.payment_wali_history(12) as r")).r[0].items.some((r) => r.y * 12 + r.m > CUR + 20),
  "Riwayat tidak memuat bulan di luar tagihan");

// setelah dilunasi, santri hilang dari daftar tunggakan wali lain
const inv3 = (await one(U.w1, "select public.payment_wali_invoices() as r")).r;
ok(JSON.stringify(inv3.others.map((o) => o.name)) === JSON.stringify(["Santri Lima", "Santri Enam"]),
  "Santri yang sudah dibayarkan hilang dari daftar tunggakan");
const inv1b = (await one(U.w1, "select public.payment_wali_invoices() as r")).r;
ok(inv1b.children[0].ahead.filter((a) => a.status === "PAID").length === 3, "Bulan di muka yang lunas tampil PAID di daftar 'ahead'");

// gate tidak terganggu tagihan bulan depan yang sudah lunas
const gate = (await one(U.w1, "select public.wali_payment_gate() as g")).g;
ok(gate.unpaid_count === 1, `Gate hanya menghitung bulan berjalan (${gate.unpaid_count} belum lunas)`);
const genNew = (await one(U.dev, "select public.invoice_ensure_month() as n")).n;
const dup = (await one(U.dev, `select count(*)::int as n from public.payment_invoices where student_id = '${S.s1}' and year = ${ym(CUR + 1).y} and month = ${ym(CUR + 1).m}`)).n;
ok(dup === 1, `Generate tagihan bulanan tidak menggandakan tagihan yang sudah dibayar di muka (baru: ${genNew})`);

// ---- 6. pembayaran otomatis (webhook, service_role) --------------------------------------
ok(await fails(U.w1, `select public.payment_initiate('${JSON.stringify([item(S.s6, CUR - 3, 1000), item(S.s6, CUR - 2, 1000)])}'::jsonb, 'IPAYMU')`, "OTOMATIS_MINIMAL"),
  "Otomatis < Rp10.000 ditolak");
const auto = await pay(U.w1, [item(S.s5, CUR - 5, 5000), item(S.s5, CUR - 4, 5000)], "IPAYMU");
ok(auto.total === 10000, "Pembayaran otomatis Rp10.000 untuk 2 bulan santri lain dibuat");
await db.exec(`select public.payment_mark_paid_auto('${auto.reference}', 'TRX-1', 'qris')`);
const hist5 = (await one(U.w1, `select public.payment_wali_history(12) as r`)).r;
ok(hist5.length === 1, "Riwayat hanya berisi anak milik akun ini");
const notif = (await one(U.dev, `select link from public.notifications where user_id = '${U.w1}' and type = 'PAYMENT_CONFIRMED' order by created_at desc limit 1`));
ok(notif?.link === "/santri/infak", `Notifikasi pembayaran otomatis menaut ke /santri/infak (dapat ${notif?.link})`);
const staleFn = (await one(U.dev, `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%/wali/infak%'`)).n;
ok(staleFn === 0, "Tidak ada fungsi database yang masih menaut ke rute usang /wali/infak");
const paidAuto = (await one(U.dev, `select count(*)::int as n from public.payment_invoices where student_id = '${S.s5}' and status = 'PAID' and paid_via = 'IPAYMU'`)).n;
ok(paidAuto === 2, "Webhook otomatis menandai 2 bulan LUNAS");

// ---- 7. keamanan ----------------------------------------------------------------------------
const priv = await one(U.dev, `select
  has_function_privilege('authenticated', 'public.payment_mark_paid_auto(text,text,text)', 'execute') as auth_paid,
  has_function_privilege('authenticated', 'public.payment_expire_auto(text)', 'execute') as auth_exp,
  has_function_privilege('anon', 'public.payment_mark_paid_auto(text,text,text)', 'execute') as anon_paid,
  has_function_privilege('service_role', 'public.payment_mark_paid_auto(text,text,text)', 'execute') as svc_paid,
  has_function_privilege('service_role', 'public.payment_expire_auto(text)', 'execute') as svc_exp`);
ok(!priv.auth_paid && !priv.auth_exp && !priv.anon_paid, "payment_mark_paid_auto / payment_expire_auto TIDAK bisa dipanggil user login/anon");
ok(priv.svc_paid && priv.svc_exp, "service_role (webhook) tetap bisa memanggilnya");

const pendTx = await pay(U.w1, [item(S.s6, CUR - 3), item(S.s6, CUR - 2)]);
let denied = false;
await db.exec(`select set_config('request.jwt.claim.sub', '${U.w1}', false)`);
await db.exec("set role authenticated");
try {
  await db.query(`select public.payment_mark_paid_auto('${pendTx.reference}', 'FAKE', null)`);
} catch (e) {
  denied = /permission denied/i.test(String(e.message));
} finally {
  await db.exec("reset role");
}
ok(denied, "Wali TIDAK bisa menandai transaksinya lunas lewat RPC webhook (permission denied)");
const stillPending = (await one(U.dev, `select status from public.payment_transactions where id = '${pendTx.transaction_id}'`)).status;
ok(stillPending === "PENDING", "Transaksi tetap PENDING setelah percobaan bypass");

// RLS: wali lain tetap tidak bisa membaca transaksi milik pembayar
async function rlsCount(uid, table) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec("set role authenticated");
  try {
    return (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
  } finally {
    await db.exec("reset role");
  }
}
ok((await rlsCount(U.w2, "payment_transactions")) === 0, "RLS: wali santri yang dibayarkan tidak bisa membaca transaksi pembayar (nama pembayar hanya lewat RPC riwayat)");
ok((await rlsCount(U.w4, "payment_invoices")) === 7, "RLS: wali lembaga lain hanya membaca tagihan anaknya sendiri (7 bulan)");

await db.close();
console.log(failed ? `\n${failed} pemeriksaan GAGAL` : "\nSemua pemeriksaan LULUS");
process.exit(failed ? 1 : 0);
