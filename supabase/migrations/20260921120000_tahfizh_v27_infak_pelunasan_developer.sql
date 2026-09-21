-- ============================================================================
-- TAHFIZH V27 — INFAK PENGEMBANGAN: PELUNASAN OLEH DEVELOPER + ATAS NAMA
-- ============================================================================
-- Aturan baru:
--   1. DEVELOPER dapat MELUNASI tagihan infak pengembangan santri secara
--      langsung (pembayaran diterima di luar aplikasi: tunai, transfer ke
--      rekening lain, donatur, dsb.) dan WAJIB menuliskan DIBAYARKAN OLEH
--      SIAPA. Nama pembayar itu tampil di dasbor/riwayat santri yang
--      bersangkutan ("Dibayarkan tanggal … oleh …").
--        - metode transaksi baru: 'OFFLINE' (pelunasan dicatat Developer);
--        - satu transaksi per lembaga, banyak santri × banyak bulan sekaligus;
--        - idempoten per tagihan: tagihan yang sudah PAID ditolak.
--   2. Kolom baru payment_transactions.payer_alias = "dibayarkan atas nama".
--      Dipakai dua hal:
--        - pelunasan Developer  -> nama donatur/pembayar yang dituliskan;
--        - wali membayarkan santri lain -> boleh memakai nama lain /
--          "Hamba Allah" (infak anonim) tanpa menghilangkan jejak audit,
--          karena payer_name & payer_profile_id tetap identitas asli.
--      Semua tampilan ke santri memakai coalesce(payer_alias, payer_name).
--   3. Daftar tunggakan untuk Developer (payment_dev_arrears): seluruh santri
--      dari semua lembaga yang belum membayar, diurutkan dari tunggakan
--      PALING LAMA, dengan filter lembaga & pencarian nama/kode.
-- Aman dijalankan ulang (idempoten). Tidak ada drop tabel / kolom / data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Skema: metode OFFLINE + kolom "atas nama"
-- ---------------------------------------------------------------------------
alter table public.payment_transactions
  add column if not exists payer_alias text;

comment on column public.payment_transactions.payer_alias is
  'V27: nama yang ditampilkan ke santri sebagai pembayar ("dibayarkan oleh …"). '
  'NULL = pakai payer_name. payer_name/payer_profile_id tetap identitas asli (audit).';

alter table public.payment_transactions
  drop constraint if exists payment_transactions_method_check;
alter table public.payment_transactions
  add constraint payment_transactions_method_check
  check (method in ('MANUAL', 'IPAYMU', 'OFFLINE'));

create index if not exists payment_transactions_method_idx
  on public.payment_transactions (method);

-- ---------------------------------------------------------------------------
-- 2. payment_initiate — tambahan parameter p_payer_alias (opsional).
--    Isi fungsi lain (validasi santri satu lembaga, multi bulan, kunci baris,
--    bayar di muka 11 bulan) TIDAK berubah dari V12.
-- ---------------------------------------------------------------------------
drop function if exists public.payment_initiate(jsonb, text);

create or replace function public.payment_initiate(
  p_items jsonb,                       -- [{studentId, y, m, amount}]
  p_method text,                       -- MANUAL | IPAYMU
  p_payer_alias text default null      -- "atas nama" (opsional)
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_item jsonb;
  v_student public.students;
  v_invoice public.payment_invoices;
  v_today record;
  v_default integer;
  v_cur integer;
  v_idx integer;
  v_sid uuid;
  v_y integer;
  v_m integer;
  v_amount integer;
  v_key text;
  v_alias text;
  v_seen text[] := '{}';
  v_invoice_ids uuid[] := '{}';
  v_amounts integer[] := '{}';
  v_total integer := 0;
  v_tx_id uuid;
  v_reference text;
  n integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_method not in ('MANUAL','IPAYMU') then raise exception 'METODE_TIDAK_VALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEM_KOSONG';
  end if;
  if jsonb_array_length(p_items) > 120 then raise exception 'ITEM_TERLALU_BANYAK'; end if;

  v_alias := nullif(btrim(coalesce(p_payer_alias, '')), '');
  if v_alias is not null and char_length(v_alias) > 60 then raise exception 'NAMA_TERLALU_PANJANG'; end if;

  select * into v_today from public.jakarta_today();
  v_cur := v_today.y * 12 + v_today.m;
  select greatest(coalesce(default_amount, 1000), 1000) into v_default
  from public.platform_payment_settings where id;
  v_default := coalesce(v_default, 1000);

  -- Validasi seluruh item SEBELUM membuat transaksi (rule #37/#100).
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_sid    := (v_item->>'studentId')::uuid;
      v_y      := (v_item->>'y')::integer;
      v_m      := (v_item->>'m')::integer;
      v_amount := (v_item->>'amount')::integer;
    exception when others then
      raise exception 'ITEM_TIDAK_VALID';
    end;
    if v_sid is null or v_y is null or v_m is null or v_amount is null then
      raise exception 'ITEM_TIDAK_VALID';
    end if;
    if v_m not between 1 and 12 or v_y not between 2020 and 2100 then
      raise exception 'ITEM_TIDAK_VALID';
    end if;
    if v_amount < 1000 then raise exception 'NOMINAL_MINIMAL'; end if;

    v_key := v_sid::text || ':' || v_y::text || ':' || v_m::text;
    if v_key = any (v_seen) then raise exception 'ITEM_GANDA'; end if;
    v_seen := v_seen || v_key;

    select * into v_student from public.students
      where id = v_sid and tenant_id = v_profile.tenant_id and status = 'ACTIVE';
    if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

    select * into v_invoice from public.payment_invoices
      where tenant_id = v_profile.tenant_id and student_id = v_sid
        and year = v_y and month = v_m
      for update;

    if v_invoice is null then
      v_idx := v_y * 12 + v_m;
      if v_idx < v_cur then raise exception 'TAGIHAN_TIDAK_DITEMUKAN'; end if;
      if v_idx > v_cur + 11 then raise exception 'BULAN_DI_LUAR_BATAS'; end if;

      insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
      values (
        v_profile.tenant_id, v_sid,
        case when v_m >= 7 then v_y::text || '/' || (v_y + 1)::text
             else (v_y - 1)::text || '/' || v_y::text end,
        v_y, v_m, v_default
      )
      on conflict (tenant_id, student_id, academic_year, year, month) do nothing;

      select * into v_invoice from public.payment_invoices
        where tenant_id = v_profile.tenant_id and student_id = v_sid
          and year = v_y and month = v_m
        for update;
      if v_invoice is null then raise exception 'TAGIHAN_TIDAK_DITEMUKAN'; end if;
    end if;

    if v_invoice.status = 'PAID' then raise exception 'SUDAH_LUNAS'; end if;
    if exists (
      select 1 from public.payment_allocations a
      join public.payment_transactions t on t.id = a.transaction_id
      where a.invoice_id = v_invoice.id and t.status in ('PENDING','WAITING_CONFIRM')
    ) then raise exception 'MENUNGGU_PEMBAYARAN'; end if;
    if v_amount < v_invoice.amount then raise exception 'NOMINAL_KURANG'; end if;

    v_invoice_ids := v_invoice_ids || v_invoice.id;
    v_amounts     := v_amounts || v_amount;
    v_total       := v_total + v_amount;
  end loop;

  if p_method = 'IPAYMU' and v_total < 10000 then
    raise exception 'OTOMATIS_MINIMAL';
  end if;

  v_reference := 'INF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.payment_transactions (
    tenant_id, payer_profile_id, payer_name, payer_alias, method, total_amount, status, reference
  ) values (
    v_profile.tenant_id, v_profile.id, v_profile.full_name, v_alias, p_method, v_total, 'PENDING', v_reference
  )
  returning id into v_tx_id;

  for n in 1 .. array_length(v_invoice_ids, 1) loop
    insert into public.payment_allocations (transaction_id, invoice_id, tenant_id, amount)
    values (v_tx_id, v_invoice_ids[n], v_profile.tenant_id, v_amounts[n]);

    update public.payment_invoices set status = 'PENDING', updated_at = now()
    where id = v_invoice_ids[n] and status <> 'PAID';
  end loop;

  return jsonb_build_object(
    'transaction_id', v_tx_id, 'reference', v_reference,
    'total', v_total, 'items', array_length(v_invoice_ids, 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. payment_dev_arrears — daftar santri menunggak SEMUA lembaga,
--    diurutkan dari tunggakan paling lama (untuk layar pelunasan Developer).
-- ---------------------------------------------------------------------------
create or replace function public.payment_dev_arrears(
  p_query     text default null,
  p_tenant_id uuid default null,
  p_limit     integer default 200
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
  v_cur integer;
  v_limit integer;
  v_q text;
  v_default integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_today from public.jakarta_today();
  v_cur   := v_today.y * 12 + v_today.m;
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_q     := nullif(btrim(coalesce(p_query, '')), '');
  select greatest(coalesce(default_amount, 1000), 1000) into v_default
  from public.platform_payment_settings where id;

  return jsonb_build_object(
    'y', v_today.y, 'm', v_today.m,
    'defaultAmount', coalesce(v_default, 1000),
    'tenants', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'code', t.business_code)
                      order by t.name), '[]'::jsonb)
      from public.tenants t where t.status = 'ACTIVE'
    ),
    'students', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'studentId', q.id, 'name', q.name, 'code', q.code,
               'tenantId', q.tenant_id, 'tenantName', q.tenant_name, 'tenantCode', q.tenant_code,
               'oldestY', (q.oldest_idx - 1) / 12, 'oldestM', ((q.oldest_idx - 1) % 12) + 1,
               'monthsBehind', greatest(v_cur - q.oldest_idx, 0),
               'unpaidCount', q.cnt, 'unpaidTotal', q.total, 'invoices', q.invs
             ) order by q.oldest_idx, q.cnt desc, q.name), '[]'::jsonb)
      from (
        select s.id, s.full_name as name, s.business_code as code,
               t.id as tenant_id, t.name as tenant_name, t.business_code as tenant_code,
               min(i.year * 12 + i.month) filter (where i.status = 'UNPAID') as oldest_idx,
               count(*) filter (where i.status = 'UNPAID') as cnt,
               coalesce(sum(i.amount) filter (where i.status = 'UNPAID'), 0) as total,
               jsonb_agg(jsonb_build_object(
                 'id', i.id, 'y', i.year, 'm', i.month, 'amount', i.amount, 'status', i.status
               ) order by i.year, i.month) as invs
        from public.students s
        join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
        join public.payment_invoices i on i.student_id = s.id
        where s.status = 'ACTIVE'
          and i.status <> 'PAID'
          and i.year * 12 + i.month <= v_cur
          and (p_tenant_id is null or s.tenant_id = p_tenant_id)
          and (v_q is null
               or s.full_name ilike '%' || v_q || '%'
               or s.business_code ilike '%' || v_q || '%'
               or t.name ilike '%' || v_q || '%'
               or t.business_code ilike '%' || v_q || '%')
        group by s.id, s.full_name, s.business_code, t.id, t.name, t.business_code
        having count(*) filter (where i.status = 'UNPAID') > 0
        order by min(i.year * 12 + i.month) filter (where i.status = 'UNPAID'),
                 count(*) filter (where i.status = 'UNPAID') desc, s.full_name
        limit v_limit
      ) q
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. payment_dev_settle — DEVELOPER melunasi tagihan & menuliskan pembayarnya.
--    p_items       : [{studentId, y, m, amount}] (amount opsional -> nilai tagihan)
--    p_payer_name  : WAJIB — "dibayarkan oleh siapa" (tampil ke santri)
--    p_note        : catatan pelunasan (opsional, terlihat di detail transaksi)
--    p_force       : bila true, transaksi wali yang masih PENDING/menunggu
--                    konfirmasi untuk tagihan yang sama dibatalkan otomatis.
--    Satu transaksi dibuat PER LEMBAGA, langsung berstatus PAID.
-- ---------------------------------------------------------------------------
create or replace function public.payment_dev_settle(
  p_items      jsonb,
  p_payer_name text,
  p_note       text default null,
  p_force      boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_item jsonb;
  v_student public.students;
  v_invoice public.payment_invoices;
  v_today record;
  v_default integer;
  v_cur integer;
  v_idx integer;
  v_sid uuid;
  v_y integer;
  v_m integer;
  v_amount integer;
  v_key text;
  v_name text;
  v_note text;
  v_seen text[] := '{}';
  v_tenants uuid[] := '{}';
  v_student_ids uuid[] := '{}';
  v_inv_ids uuid[] := '{}';
  v_inv_tenants uuid[] := '{}';
  v_amounts integer[] := '{}';
  v_conflict uuid[] := '{}';
  v_total integer := 0;
  v_tx_count integer := 0;
  v_tenant uuid;
  v_tx_id uuid;
  v_tx_total integer;
  v_reference text;
  n integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  v_name := nullif(btrim(coalesce(p_payer_name, '')), '');
  if v_name is null then raise exception 'NAMA_PEMBAYAR_WAJIB'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'NAMA_PEMBAYAR_TIDAK_VALID'; end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEM_KOSONG';
  end if;
  if jsonb_array_length(p_items) > 300 then raise exception 'ITEM_TERLALU_BANYAK'; end if;

  select * into v_today from public.jakarta_today();
  v_cur := v_today.y * 12 + v_today.m;
  select greatest(coalesce(default_amount, 1000), 1000) into v_default
  from public.platform_payment_settings where id;
  v_default := coalesce(v_default, 1000);

  -- Validasi seluruh item SEBELUM ada perubahan status.
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_sid    := (v_item->>'studentId')::uuid;
      v_y      := (v_item->>'y')::integer;
      v_m      := (v_item->>'m')::integer;
      v_amount := nullif(v_item->>'amount', '')::integer;
    exception when others then
      raise exception 'ITEM_TIDAK_VALID';
    end;
    if v_sid is null or v_y is null or v_m is null then raise exception 'ITEM_TIDAK_VALID'; end if;
    if v_m not between 1 and 12 or v_y not between 2020 and 2100 then raise exception 'ITEM_TIDAK_VALID'; end if;

    v_key := v_sid::text || ':' || v_y::text || ':' || v_m::text;
    if v_key = any (v_seen) then raise exception 'ITEM_GANDA'; end if;
    v_seen := v_seen || v_key;

    select * into v_student from public.students where id = v_sid and status = 'ACTIVE';
    if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

    select * into v_invoice from public.payment_invoices
      where tenant_id = v_student.tenant_id and student_id = v_sid and year = v_y and month = v_m
      for update;

    if v_invoice is null then
      -- Bulan berjalan s.d. 11 bulan ke depan boleh dibuatkan tagihannya.
      v_idx := v_y * 12 + v_m;
      if v_idx < v_cur then raise exception 'TAGIHAN_TIDAK_DITEMUKAN'; end if;
      if v_idx > v_cur + 11 then raise exception 'BULAN_DI_LUAR_BATAS'; end if;

      insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
      values (
        v_student.tenant_id, v_sid,
        case when v_m >= 7 then v_y::text || '/' || (v_y + 1)::text
             else (v_y - 1)::text || '/' || v_y::text end,
        v_y, v_m, v_default
      )
      on conflict (tenant_id, student_id, academic_year, year, month) do nothing;

      select * into v_invoice from public.payment_invoices
        where tenant_id = v_student.tenant_id and student_id = v_sid and year = v_y and month = v_m
        for update;
      if v_invoice is null then raise exception 'TAGIHAN_TIDAK_DITEMUKAN'; end if;
    end if;

    if v_invoice.status = 'PAID' then raise exception 'SUDAH_LUNAS'; end if;

    -- Transaksi wali yang masih berjalan untuk tagihan ini.
    if exists (
      select 1 from public.payment_allocations a
      join public.payment_transactions t on t.id = a.transaction_id
      where a.invoice_id = v_invoice.id and t.status in ('PENDING','WAITING_CONFIRM')
    ) then
      if not p_force then raise exception 'MENUNGGU_PEMBAYARAN'; end if;
      select coalesce(v_conflict, '{}') || coalesce(array_agg(distinct t.id), '{}') into v_conflict
      from public.payment_allocations a
      join public.payment_transactions t on t.id = a.transaction_id
      where a.invoice_id = v_invoice.id
        and t.status in ('PENDING','WAITING_CONFIRM')
        and not (t.id = any (coalesce(v_conflict, '{}')));
    end if;

    v_amount := greatest(coalesce(v_amount, v_invoice.amount), v_invoice.amount);
    if v_amount < 1000 then raise exception 'NOMINAL_MINIMAL'; end if;

    v_inv_ids     := v_inv_ids || v_invoice.id;
    v_inv_tenants := v_inv_tenants || v_student.tenant_id;
    v_amounts     := v_amounts || v_amount;
    v_total       := v_total + v_amount;
    if not (v_student.tenant_id = any (v_tenants)) then
      v_tenants := v_tenants || v_student.tenant_id;
    end if;
    if not (v_sid = any (v_student_ids)) then
      v_student_ids := v_student_ids || v_sid;
    end if;
  end loop;

  -- Batalkan transaksi wali yang bentrok (hanya bila p_force).
  if array_length(v_conflict, 1) is not null then
    update public.payment_transactions t
    set status = 'CANCELLED',
        reject_reason = 'Tagihan dilunasi langsung oleh pengelola platform (' || v_name || ').',
        updated_at = now()
    where t.id = any (v_conflict) and t.status in ('PENDING','WAITING_CONFIRM');

    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select t.payer_profile_id, t.tenant_id, 'PAYMENT_REJECTED',
           'Transaksi dibatalkan — tagihan sudah dilunasi',
           'Tagihan pada transaksi ' || t.reference || ' telah dilunasi oleh ' || v_name || '.',
           '/santri/infak'
    from public.payment_transactions t
    where t.id = any (v_conflict);
  end if;

  -- Satu transaksi PAID per lembaga.
  foreach v_tenant in array v_tenants loop
    v_tx_total := 0;
    for n in 1 .. array_length(v_inv_ids, 1) loop
      if v_inv_tenants[n] = v_tenant then v_tx_total := v_tx_total + v_amounts[n]; end if;
    end loop;
    if v_tx_total < 1000 then continue; end if;

    v_reference := 'INF-DEV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.payment_transactions (
      tenant_id, payer_profile_id, payer_name, payer_alias, method, total_amount,
      status, reference, payer_note, submitted_at, confirmed_by, confirmed_at
    ) values (
      v_tenant, v_profile.id, v_profile.full_name, v_name, 'OFFLINE', v_tx_total,
      'PAID', v_reference, v_note, now(), v_profile.id, now()
    )
    returning id into v_tx_id;
    v_tx_count := v_tx_count + 1;

    for n in 1 .. array_length(v_inv_ids, 1) loop
      if v_inv_tenants[n] <> v_tenant then continue; end if;

      insert into public.payment_allocations (transaction_id, invoice_id, tenant_id, amount)
      values (v_tx_id, v_inv_ids[n], v_tenant, v_amounts[n])
      on conflict (transaction_id, invoice_id) do nothing;

      update public.payment_invoices
      set status = 'PAID', paid_at = now(), paid_via = 'OFFLINE', updated_at = now()
      where id = v_inv_ids[n];
    end loop;

    -- Kabari wali/santri yang tagihannya dilunasi.
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select distinct g.profile_id, v_tenant, 'PAYMENT_CONFIRMED',
           'Infak Pengembangan telah dilunasi',
           'Infak Pengembangan ' || s.full_name || ' telah dibayarkan oleh ' || v_name || '.',
           '/santri/infak'
    from public.payment_allocations a
    join public.payment_invoices i on i.id = a.invoice_id
    join public.students s on s.id = i.student_id
    join public.guardian_students gs on gs.student_id = s.id
    join public.guardians g on g.id = gs.guardian_id
    where a.transaction_id = v_tx_id and g.profile_id is not null;
  end loop;

  return jsonb_build_object(
    'transactions', v_tx_count,
    'invoices', coalesce(array_length(v_inv_ids, 1), 0),
    'students', coalesce(array_length(v_student_ids, 1), 0),
    'total', v_total,
    'payerName', v_name,
    'cancelled', coalesce(array_length(v_conflict, 1), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tampilan ke santri memakai "atas nama" bila ada (payer_alias).
--    payment_wali_status & payment_wali_history — hanya bagian pembayar yang
--    berubah; struktur lain tetap sama dengan V12.
-- ---------------------------------------------------------------------------
create or replace function public.payment_wali_status(p_year integer default null, p_month integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  p_year := coalesce(p_year, v_today.y); p_month := coalesce(p_month, v_today.m);
  select * into v_guardian from public.guardians where profile_id = v_profile.id;

  return (select coalesce(jsonb_agg(jsonb_build_object(
    'studentId', s.id, 'name', s.full_name, 'code', s.business_code,
    'status', i.status, 'amount', i.amount,
    'hasInvoice', i.id is not null,
    'paidAt', case when i.status = 'PAID' then coalesce(pi.paid_on, i.paid_at) end,
    'paidByName', case when i.status = 'PAID' then pi.payer_name end,
    'paidBySelf', (i.status = 'PAID' and pi.payer_id is not null and pi.payer_id = auth.uid()
                   and pi.method <> 'OFFLINE'),
    'paidVia', case when i.status = 'PAID' then i.paid_via end,
    'bundleMonths', case when i.status = 'PAID' then pi.bundle end
  ) order by s.full_name), '[]'::jsonb)
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  left join public.payment_invoices i
    on i.student_id = s.id and i.year = p_year and i.month = p_month
  left join lateral (
    select coalesce(t.submitted_at, t.confirmed_at) as paid_on,
           coalesce(nullif(btrim(coalesce(t.payer_alias, '')), ''), t.payer_name) as payer_name,
           t.payer_profile_id as payer_id, t.method,
           (select count(*) from public.payment_allocations a2
              join public.payment_invoices i2 on i2.id = a2.invoice_id
             where a2.transaction_id = t.id and i2.student_id = i.student_id)::int as bundle
    from public.payment_allocations a
    join public.payment_transactions t on t.id = a.transaction_id and t.status = 'PAID'
    where a.invoice_id = i.id
    order by t.confirmed_at desc nulls last
    limit 1
  ) pi on i.status = 'PAID'
  where v_guardian is not null and gs.guardian_id = v_guardian.id);
end;
$$;

create or replace function public.payment_wali_history(p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
  v_cur integer;
  v_limit integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  v_cur := v_today.y * 12 + v_today.m;
  v_limit := least(greatest(coalesce(p_limit, 12), 1), 36);
  select * into v_guardian from public.guardians where profile_id = v_profile.id;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'studentId', s.id, 'name', s.full_name, 'code', s.business_code,
      'items', (
        select coalesce(jsonb_agg(z.j order by z.idx desc), '[]'::jsonb)
        from (
          select i.year * 12 + i.month as idx,
            jsonb_build_object(
              'id', i.id, 'y', i.year, 'm', i.month, 'status', i.status,
              'amount', case when i.status = 'PAID' then coalesce(pi.paid_amount, i.amount) else i.amount end,
              'paidAt', case when i.status = 'PAID' then coalesce(pi.paid_on, i.paid_at) end,
              'paidByName', case when i.status = 'PAID' then pi.payer_name end,
              'paidBySelf', (i.status = 'PAID' and pi.payer_id is not null and pi.payer_id = auth.uid()
                             and pi.method <> 'OFFLINE'),
              'paidVia', case when i.status = 'PAID' then i.paid_via end,
              'reference', case when i.status = 'PAID' then pi.reference end,
              'bundleMonths', case when i.status = 'PAID' then pi.bundle end,
              'paidInAdvance', case
                 when i.status = 'PAID' and coalesce(pi.paid_on, i.paid_at) is not null
                   then (coalesce(pi.paid_on, i.paid_at) at time zone 'Asia/Jakarta')::date < make_date(i.year, i.month, 1)
                 else false end
            ) as j
          from public.payment_invoices i
          left join lateral (
            select coalesce(t.submitted_at, t.confirmed_at) as paid_on,
                   coalesce(nullif(btrim(coalesce(t.payer_alias, '')), ''), t.payer_name) as payer_name,
                   t.payer_profile_id as payer_id, t.reference, t.method,
                   a.amount as paid_amount,
                   (select count(*) from public.payment_allocations a2
                      join public.payment_invoices i2 on i2.id = a2.invoice_id
                     where a2.transaction_id = t.id and i2.student_id = i.student_id)::int as bundle
            from public.payment_allocations a
            join public.payment_transactions t on t.id = a.transaction_id and t.status = 'PAID'
            where a.invoice_id = i.id
            order by t.confirmed_at desc nulls last
            limit 1
          ) pi on i.status = 'PAID'
          where i.student_id = s.id
            and (i.status = 'PAID' or i.year * 12 + i.month <= v_cur)
          order by i.year desc, i.month desc
          limit v_limit
        ) z
      )
    ) order by s.full_name), '[]'::jsonb)
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
    where v_guardian is not null and gs.guardian_id = v_guardian.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Detail transaksi Developer: tampilkan "atas nama" + catatan pelunasan.
-- ---------------------------------------------------------------------------
create or replace function public.payment_dev_detail(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
  v_tenant public.tenants;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_tx from public.payment_transactions where id = p_transaction_id;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  select * into v_tenant from public.tenants where id = v_tx.tenant_id;

  return jsonb_build_object(
    'id', v_tx.id, 'reference', v_tx.reference, 'payerName', v_tx.payer_name,
    'payerAlias', nullif(btrim(coalesce(v_tx.payer_alias, '')), ''),
    'tenantName', v_tenant.name, 'tenantCode', v_tenant.business_code,
    'method', v_tx.method, 'status', v_tx.status, 'total', v_tx.total_amount,
    'proofPath', v_tx.proof_path, 'payerNote', v_tx.payer_note,
    'rejectReason', v_tx.reject_reason, 'providerTrxId', v_tx.provider_trx_id,
    'providerPaidVia', v_tx.provider_paid_via,
    'createdAt', v_tx.created_at, 'confirmedAt', v_tx.confirmed_at,
    'allocations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'student', s.full_name, 'code', s.business_code,
               'y', i.year, 'm', i.month, 'amount', a.amount, 'invoiceStatus', i.status
             ) order by s.full_name, i.year, i.month), '[]'::jsonb)
      from public.payment_allocations a
      join public.payment_invoices i on i.id = a.invoice_id
      join public.students s on s.id = i.student_id
      where a.transaction_id = v_tx.id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Hak akses
-- ---------------------------------------------------------------------------
grant execute on function
  public.payment_initiate(jsonb, text, text),
  public.payment_dev_arrears(text, uuid, integer),
  public.payment_dev_settle(jsonb, text, text, boolean),
  public.payment_wali_status(integer, integer),
  public.payment_wali_history(integer),
  public.payment_dev_detail(uuid)
to authenticated;
