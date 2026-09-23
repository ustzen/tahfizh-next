// Verifikasi fungsional migration V29 — Pengajuan Tidak Mampu (keringanan infak)
// di Postgres sungguhan (PGlite). Menjalankan SEMUA migration lalu menguji:
//   - hanya WALI yang boleh mengajukan; surat harus ≤ 7 hari terakhir
//   - pengajuan tercatat + notifikasi ke Developer; tidak boleh ganda saat PENDING
//   - hanya DEVELOPER yang memutuskan; durasi 1-24 bulan
//   - APPROVE → tagihan periode keringanan menjadi PAID/WAIVER & bebas otomatis
//   - REJECT → alasan tersimpan
//   - RLS: Admin lembaga tidak bisa membaca pengajuan
//
// Jalankan:  node scripts/verify-infak-tidak-mampu.mjs
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

// ---- bootstrap (sama dengan verify-infak-platform.mjs) ----------------------
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
const U = {
  dev: "00000000-0000-0000-0000-0000000000d1",
  admin: "00000000-0000-0000-0000-0000000000a1",
  wali: "00000000-0000-0000-0000-0000000000b1",
};
const T1 = "10000000-0000-0000-0000-000000000001";
const S1 = "20000000-0000-0000-0000-000000000001"; // anak wali
const S2 = "20000000-0000-0000-0000-000000000002"; // anak wali
const S3 = "20000000-0000-0000-0000-000000000003"; // BUKAN anak wali

await db.exec(`
  insert into auth.users (id, email) values
    ('${U.dev}', 'dev@x.id'), ('${U.admin}', 'admin@x.id'), ('${U.wali}', 'wali@x.id');
  insert into public.tenants (id, business_code, name, kind, status, created_at) values
    ('${T1}', 'T-901', 'Lembaga Satu', 'TPQ', 'ACTIVE', now() - interval '3 months');
  insert into public.profiles (id, full_name, role, tenant_id) values
    ('${U.dev}', 'Developer', 'DEVELOPER', null),
    ('${U.admin}', 'Admin Satu', 'ADMIN', '${T1}'),
    ('${U.wali}', 'Wali Satu', 'WALI_SANTRI', '${T1}');
  insert into public.students (id, tenant_id, business_code, full_name, gender, status) values
    ('${S1}', '${T1}', 'S-9001', 'Santri A', 'L', 'ACTIVE'),
    ('${S2}', '${T1}', 'S-9002', 'Santri B', 'P', 'ACTIVE'),
    ('${S3}', '${T1}', 'S-9003', 'Santri C', 'L', 'ACTIVE');
  -- Guardian bisa sudah dibuat otomatis oleh trigger profil; buat bila belum.
  insert into public.guardians (tenant_id, profile_id) values ('${T1}', '${U.wali}')
    on conflict (profile_id) do nothing;
`);

const guardianId = (
  await db.query(`select id from public.guardians where profile_id = '${U.wali}'`)
).rows[0].id;

await db.exec(`
  insert into public.guardian_students (tenant_id, guardian_id, student_id) values
    ('${T1}', '${guardianId}', '${S1}'),
    ('${T1}', '${guardianId}', '${S2}')
    on conflict do nothing;
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

const today = (await db.query("select * from public.jakarta_today()")).rows[0];
// Tanggal surat valid (hari ini Jakarta) & kedaluwarsa (10 hari lalu) dari sisi DB.
const certToday = (await db.query("select (public.jakarta_now())::date::text as d")).rows[0].d;
const certOld = (await db.query("select ((public.jakarta_now())::date - 10)::text as d")).rows[0].d;
const certFuture = (await db.query("select ((public.jakarta_now())::date + 2)::text as d")).rows[0].d;

// ---- 1. validasi pengajuan --------------------------------------------------
ok(
  await fails(U.admin, `select public.waiver_submit_request('${S1}', '${T1}/waiver-x.pdf', '${certToday}')`, "AKSES_DITOLAK"),
  "Admin lembaga TIDAK bisa mengajukan keringanan"
);
ok(
  await fails(U.wali, `select public.waiver_submit_request('${S1}', '${T1}/waiver-x.pdf', '${certOld}')`, "SURAT_KEDALUWARSA"),
  "Surat lebih dari 7 hari ditolak (SURAT_KEDALUWARSA)"
);
ok(
  await fails(U.wali, `select public.waiver_submit_request('${S1}', '${T1}/waiver-x.pdf', '${certFuture}')`, "TANGGAL_SURAT_MASA_DEPAN"),
  "Surat bertanggal masa depan ditolak"
);
ok(
  await fails(U.wali, `select public.waiver_submit_request('${S3}', '${T1}/waiver-x.pdf', '${certToday}')`, "SANTRI_TIDAK_DITEMUKAN"),
  "Wali hanya bisa mengajukan untuk anaknya sendiri"
);

const reqId = (await one(U.wali, `select public.waiver_submit_request('${S1}', '${T1}/waiver-a.pdf', '${certToday}', 'Kondisi ekonomi sulit') as id`)).id;
ok(!!reqId, "Pengajuan valid berhasil dibuat");

ok(
  await fails(U.dev, `select public.waiver_submit_request('${S1}', '${T1}/waiver-b.pdf', '${certToday}')`, "AKSES_DITOLAK"),
  "Developer tidak mengajukan (bukan wali)"
);
ok(
  await fails(U.wali, `select public.waiver_submit_request('${S1}', '${T1}/waiver-c.pdf', '${certToday}')`, "SUDAH_DIAJUKAN"),
  "Pengajuan ganda saat masih PENDING ditolak"
);

const devNotif = (await one(U.dev, `select count(*)::int as n from public.notifications where user_id = '${U.dev}' and title = 'Pengajuan tidak mampu baru'`)).n;
ok(devNotif === 1, "Pengajuan mengirim notifikasi ke Developer");

const waliList = (await one(U.wali, "select public.waiver_wali_list() as l")).l;
ok(Array.isArray(waliList) && waliList.length === 1 && waliList[0].status === "PENDING", "Daftar pengajuan wali menampilkan pengajuan PENDING");
const devList = (await one(U.dev, "select public.waiver_dev_list('PENDING', null) as l")).l;
ok(devList.length === 1 && devList[0].tenantCode === "T-901", "Daftar pengajuan Developer memuat info lembaga");

// ---- 2. keputusan Developer -------------------------------------------------
ok(await fails(U.wali, `select public.waiver_dev_decide('${reqId}', 'APPROVE', 3)`, "AKSES_DITOLAK"), "Wali TIDAK bisa memutuskan pengajuan");
ok(await fails(U.dev, `select public.waiver_dev_decide('${reqId}', 'APPROVE', 0)`, "DURASI_TIDAK_VALID"), "Durasi 0 bulan ditolak");
ok(await fails(U.dev, `select public.waiver_dev_decide('${reqId}', 'APPROVE', 99)`, "DURASI_TIDAK_VALID"), "Durasi > 24 bulan ditolak");

// Buat tagihan bulan berjalan dulu, lalu setujui 3 bulan.
await as(U.dev, "select public.invoice_ensure_month()");
const before = (await one(U.dev, `select status, amount from public.payment_invoices where student_id = '${S1}' and year = ${today.y} and month = ${today.m}`));
ok(before.status === "UNPAID", "Tagihan bulan berjalan awalnya UNPAID");

await as(U.dev, `select public.waiver_dev_decide('${reqId}', 'APPROVE', 3)`);
const after = (await one(U.dev, `select status, paid_via from public.payment_invoices where student_id = '${S1}' and year = ${today.y} and month = ${today.m}`));
ok(after.status === "PAID" && after.paid_via === "WAIVER", "APPROVE → tagihan bulan berjalan menjadi PAID/WAIVER");

const waivedNow = (await one(U.dev, `select public.student_waived_at('${S1}', ${today.y}, ${today.m}) as w`)).w;
const waivedNext = (await one(U.dev, `select public.student_waived_at('${S1}', ${(today.m === 12 ? today.y + 1 : today.y)}, ${(today.m === 12 ? 1 : today.m + 1)}) as w`)).w;
ok(waivedNow === true && waivedNext === true, "Bulan berjalan & bulan berikutnya dianggap bebas");
const notWaived = (await one(U.dev, `select public.student_waived_at('${S2}', ${today.y}, ${today.m}) as w`)).w;
ok(notWaived === false, "Santri lain tidak terkena keringanan");

const approved = (await one(U.dev, `select status, waive_months from public.payment_waiver_requests where id = '${reqId}'`));
ok(approved.status === "APPROVED" && approved.waive_months === 3, "Status pengajuan menjadi APPROVED dengan durasi tersimpan");
const waliNotif = (await one(U.wali, `select count(*)::int as n from public.notifications where user_id = '${U.wali}' and title = 'Pengajuan tidak mampu disetujui'`)).n;
ok(waliNotif === 1, "Wali menerima notifikasi persetujuan");

// Generate bulan depan → langsung bebas (PAID/WAIVER) untuk santri yang di-waive.
const nm = today.m === 12 ? 1 : today.m + 1;
const ny = today.m === 12 ? today.y + 1 : today.y;
await as(U.dev, `select public.invoice_ensure_month(${ny}, ${nm})`);
const nextInv = (await one(U.dev, `select status, paid_via from public.payment_invoices where student_id = '${S1}' and year = ${ny} and month = ${nm}`));
ok(nextInv.status === "PAID" && nextInv.paid_via === "WAIVER", "Tagihan bulan depan yang masuk periode keringanan langsung bebas");
const otherNext = (await one(U.dev, `select status from public.payment_invoices where student_id = '${S2}' and year = ${ny} and month = ${nm}`));
ok(otherNext.status === "UNPAID", "Tagihan santri lain bulan depan tetap normal");

// Gate: santri waived tidak menambah tagihan belum lunas wali.
const gate = (await one(U.wali, "select public.wali_payment_gate() as g")).g;
ok(gate.unpaid_count === 1, `Gate hanya menghitung tagihan belum lunas non-waiver (unpaid=${gate.unpaid_count}, harus 1 = Santri B)`);

// ---- 3. penolakan -----------------------------------------------------------
await as(U.wali, `select public.waiver_submit_request('${S2}', '${T1}/waiver-s2.pdf', '${certToday}', null)`);
const req2 = (await one(U.dev, `select id from public.payment_waiver_requests where student_id = '${S2}' and status = 'PENDING'`)).id;
await as(U.dev, `select public.waiver_dev_decide('${req2}', 'REJECT', null, 'Surat tidak terbaca')`);
const rejected = (await one(U.dev, `select status, reject_reason from public.payment_waiver_requests where id = '${req2}'`));
ok(rejected.status === "REJECTED" && rejected.reject_reason === "Surat tidak terbaca", "Penolakan menyimpan status & alasan");
ok(await fails(U.dev, `select public.waiver_dev_decide('${req2}', 'APPROVE', 2)`, "STATUS_TIDAK_DAPAT_DIUBAH"), "Pengajuan yang sudah diputuskan tidak bisa diputuskan ulang");

// ---- 4. RLS -----------------------------------------------------------------
async function rlsCount(uid, table) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec("set role authenticated");
  try {
    return (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
  } finally {
    await db.exec("reset role");
  }
}
ok((await rlsCount(U.admin, "payment_waiver_requests")) === 0, "RLS: Admin lembaga tidak bisa membaca pengajuan");
ok((await rlsCount(U.wali, "payment_waiver_requests")) === 2, "RLS: Wali hanya membaca pengajuan miliknya");
ok((await rlsCount(U.dev, "payment_waiver_requests")) === 2, "RLS: Developer membaca semua pengajuan");

await db.close();
console.log(failed ? `\n${failed} pemeriksaan GAGAL` : "\nSemua pemeriksaan LULUS");
process.exit(failed ? 1 : 0);
