-- ============================================================================
-- TAHFIZH V12 — INFAK: BAYARKAN SANTRI LAIN, BAYAR BEBERAPA BULAN, RIWAYAT
--               PER BULAN
-- ============================================================================
-- Aturan baru:
--   1. Wali (akun Santri) dapat membayarkan infak santri lain di LEMBAGA YANG
--      SAMA dengan mencentang santri lalu membayar. Daftar santri diurutkan
--      dari yang MENUNGGAK PALING LAMA (bulan tagihan UNPAID tertua lebih
--      dulu, lalu jumlah bulan tunggakan terbanyak, lalu nama).
--   2. Di dasbor santri yang dibayarkan tampil infaknya dibayarkan oleh siapa
--      dan tanggal berapa (payment_wali_status + payment_wali_history).
--   3. Beberapa bulan sekaligus: semua tunggakan + bulan berjalan + bayar di
--      muka sampai 11 bulan ke depan (tagihan bulan depan dibuat otomatis saat
--      dibayar). Satu transaksi = banyak alokasi; RIWAYAT TETAP PER BULAN
--      (satu baris per tagihan) dengan keterangan "dibayarkan tanggal …".
--   4. KEAMANAN: payment_mark_paid_auto & payment_expire_auto sebelumnya bisa
--      dipanggil user login mana pun (grant ke authenticated, tanpa cek
--      pemanggil) sehingga wali dapat menandai transaksinya LUNAS tanpa
--      membayar. Kini hanya service_role (webhook iPaymu).
-- Aman dijalankan ulang (idempoten). Tidak ada drop tabel / kolom / data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. KEAMANAN — RPC webhook hanya untuk service_role
-- ---------------------------------------------------------------------------
revoke all on function public.payment_mark_paid_auto(text, text, text) from public, anon, authenticated;
revoke all on function public.payment_expire_auto(text)                from public, anon, authenticated;
grant execute on function public.payment_mark_paid_auto(text, text, text) to service_role;
grant execute on function public.payment_expire_auto(text)                to service_role;

-- ---------------------------------------------------------------------------
-- 1. Tanggal pembayaran dilakukan (bukti transfer dikirim) — dipakai untuk
--    keterangan "dibayarkan tanggal …". Pembayaran otomatis memakai
--    confirmed_at (saat webhook diterima).
-- ---------------------------------------------------------------------------
alter table public.payment_transactions
  add column if not exists submitted_at timestamptz;

comment on column public.payment_transactions.submitted_at is
  'V12: waktu wali mengirim bukti transfer (tanggal pembayaran dilakukan). Otomatis (iPaymu) memakai confirmed_at.';

create or replace function public.payment_submit_proof(
  p_transaction_id uuid,
  p_proof_path     text,
  p_note           text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_tx from public.payment_transactions
    where id = p_transaction_id and payer_profile_id = v_profile.id and tenant_id = v_profile.tenant_id;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.status not in ('PENDING') then raise exception 'STATUS_TIDAK_DAPAT_DIUBAH'; end if;
  if btrim(coalesce(p_proof_path, '')) = '' then raise exception 'BUKTI_WAJIB'; end if;

  update public.payment_transactions
  set status = 'WAITING_CONFIRM', proof_path = btrim(p_proof_path),
      payer_note = nullif(btrim(coalesce(p_note, '')), ''),
      submitted_at = now(), updated_at = now()
  where id = p_transaction_id;

  update public.payment_invoices i set status = 'WAITING_CONFIRM', updated_at = now()
  where i.status <> 'PAID' and exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = p_transaction_id
  );

  insert into public.notifications (user_id, tenant_id, type, title, body, link)
  select id, null, 'PAYMENT_SUBMITTED',
         'Pembayaran menunggu konfirmasi',
         v_profile.full_name || ' mengirim bukti pembayaran infak.',
         '/developer/infak/transaksi/' || v_tx.id::text
  from public.profiles
  where role = 'DEVELOPER';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. payment_initiate — banyak santri × banyak bulan dalam SATU transaksi
--    * santri harus aktif & di lembaga yang sama dengan pembayar (boleh
--      santri lain, bukan hanya anak sendiri);
--    * bulan berjalan / sampai 11 bulan ke depan yang belum punya tagihan
--      dibuat otomatis (bayar di muka); bulan lampau tanpa tagihan ditolak;
--    * baris tagihan dikunci (FOR UPDATE) agar dua pembayaran serentak untuk
--      bulan yang sama tidak lolos bersamaan;
--    * item ganda & lebih dari 120 item ditolak.
-- ---------------------------------------------------------------------------
create or replace function public.payment_initiate(
  p_items jsonb,     -- [{studentId, y, m, amount}]
  p_method text      -- MANUAL | IPAYMU
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
    if v_amount < 1000 then raise exception 'NOMINAL_MINIMAL'; end if;   -- rule #101/#103

    v_key := v_sid::text || ':' || v_y::text || ':' || v_m::text;
    if v_key = any (v_seen) then raise exception 'ITEM_GANDA'; end if;
    v_seen := v_seen || v_key;

    -- Santri harus aktif dan satu lembaga dengan pembayar (rule #37).
    select * into v_student from public.students
      where id = v_sid and tenant_id = v_profile.tenant_id and status = 'ACTIVE';
    if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

    select * into v_invoice from public.payment_invoices
      where tenant_id = v_profile.tenant_id and student_id = v_sid
        and year = v_y and month = v_m
      for update;

    if v_invoice is null then
      -- Belum ada tagihan: hanya bulan berjalan s.d. 11 bulan ke depan yang
      -- boleh dibuat (bayar di muka). Bulan lampau tanpa tagihan tidak ditagih.
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

    if v_invoice.status = 'PAID' then raise exception 'SUDAH_LUNAS'; end if;     -- rule #37
    if exists (
      select 1 from public.payment_allocations a
      join public.payment_transactions t on t.id = a.transaction_id
      where a.invoice_id = v_invoice.id and t.status in ('PENDING','WAITING_CONFIRM')
    ) then raise exception 'MENUNGGU_PEMBAYARAN'; end if;
    if v_amount < v_invoice.amount then
      raise exception 'NOMINAL_KURANG';   -- kurang dari tagihan bulan tsb ditolak
    end if;

    v_invoice_ids := v_invoice_ids || v_invoice.id;
    v_amounts     := v_amounts || v_amount;
    v_total       := v_total + v_amount;
  end loop;

  -- Pembayaran otomatis hanya bila total ≥ Rp10.000 (rule #13/#102).
  if p_method = 'IPAYMU' and v_total < 10000 then
    raise exception 'OTOMATIS_MINIMAL';
  end if;

  v_reference := 'INF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.payment_transactions (
    tenant_id, payer_profile_id, payer_name, method, total_amount, status, reference
  ) values (
    v_profile.tenant_id, v_profile.id, v_profile.full_name, p_method, v_total, 'PENDING', v_reference
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
-- 3. payment_wali_invoices — tagihan anak sendiri (tunggakan + bulan berjalan
--    + 11 bulan ke depan) dan DAFTAR SANTRI LAIN di lembaga yang menunggak,
--    diurutkan dari yang paling lama menunggak.
-- ---------------------------------------------------------------------------
create or replace function public.payment_wali_invoices(p_year integer default null, p_month integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
  v_settings public.platform_payment_settings;
  v_default integer;
  v_cur integer;
  v_children jsonb;
  v_others jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  p_year := coalesce(p_year, v_today.y); p_month := coalesce(p_month, v_today.m);
  v_cur := v_today.y * 12 + v_today.m;
  select * into v_settings from public.platform_payment_settings where id;
  v_default := greatest(coalesce(v_settings.default_amount, 1000), 1000);

  select * into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is not null then
    perform public.invoice_ensure_for_guardian(v_guardian.id);
  end if;

  -- Anak sendiri: tagihan belum lunas s.d. bulan berjalan (terlama dulu) +
  -- 11 bulan ke depan (status NONE = belum ada tagihan, dibuat saat dibayar).
  select coalesce(jsonb_agg(x.j order by x.n), '[]'::jsonb) into v_children
  from (
    select s.full_name as n,
      jsonb_build_object(
        'studentId', s.id, 'name', s.full_name, 'code', s.business_code,
        'invoices', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id, 'y', i.year, 'm', i.month,
                   'amount', i.amount, 'status', i.status,
                   'paidAt', i.paid_at, 'paidVia', i.paid_via
                 ) order by i.year, i.month), '[]'::jsonb)
          from public.payment_invoices i
          where i.student_id = s.id and i.status <> 'PAID'
            and i.year * 12 + i.month <= v_cur
        ),
        'ahead', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id, 'y', g.y, 'm', g.m,
                   'amount', coalesce(i.amount, v_default),
                   'status', coalesce(i.status, 'NONE')
                 ) order by g.k), '[]'::jsonb)
          from (
            select k, ((v_cur - 1 + k) / 12) as y, ((v_cur - 1 + k) % 12) + 1 as m
            from generate_series(1, 11) k
          ) g
          left join public.payment_invoices i
            on i.student_id = s.id and i.year = g.y and i.month = g.m
        )
      ) as j
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
    where v_guardian is not null and gs.guardian_id = v_guardian.id
  ) x;

  -- Santri lain di lembaga yang sama yang punya tunggakan (status UNPAID s.d.
  -- bulan berjalan). Urutan: bulan tunggakan tertua, jumlah bulan terbanyak, nama.
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId', q.id, 'name', q.name, 'code', q.code,
           'oldestY', (q.oldest_idx - 1) / 12, 'oldestM', ((q.oldest_idx - 1) % 12) + 1,
           'unpaidCount', q.cnt, 'unpaidTotal', q.total, 'invoices', q.invs
         ) order by q.oldest_idx, q.cnt desc, q.name), '[]'::jsonb) into v_others
  from (
    select s.id, s.full_name as name, s.business_code as code,
           min(i.year * 12 + i.month) filter (where i.status = 'UNPAID') as oldest_idx,
           count(*) filter (where i.status = 'UNPAID') as cnt,
           coalesce(sum(i.amount) filter (where i.status = 'UNPAID'), 0) as total,
           jsonb_agg(jsonb_build_object(
             'id', i.id, 'y', i.year, 'm', i.month, 'amount', i.amount, 'status', i.status
           ) order by i.year, i.month) as invs
    from public.students s
    join public.payment_invoices i on i.student_id = s.id
    where s.tenant_id = v_profile.tenant_id
      and s.status = 'ACTIVE'
      and i.status <> 'PAID'
      and i.year * 12 + i.month <= v_cur
      and (v_guardian is null or s.id not in (
            select gs.student_id from public.guardian_students gs where gs.guardian_id = v_guardian.id))
    group by s.id, s.full_name, s.business_code
    having count(*) filter (where i.status = 'UNPAID') > 0
    order by min(i.year * 12 + i.month) filter (where i.status = 'UNPAID'),
             count(*) filter (where i.status = 'UNPAID') desc, s.full_name
    limit 300
  ) q;

  return jsonb_build_object(
    'children', v_children,
    'others', v_others,
    'defaultAmount', v_default,
    'y', p_year, 'm', p_month, 'academicYear', v_today.ay,
    'bank', jsonb_build_object(
      'bankName', v_settings.bank_name, 'bankNo', v_settings.bank_account_no,
      'bankAccount', v_settings.bank_account_name, 'instructions', v_settings.instructions,
      'confirmNote', v_settings.confirm_note, 'qrisPath', v_settings.qris_path
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. payment_wali_status — kartu dasbor: status bulan ini per anak + SIAPA
--    yang membayarkan dan tanggalnya (bila sudah lunas).
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
    'paidBySelf', (i.status = 'PAID' and pi.payer_id is not null and pi.payer_id = auth.uid()),
    'bundleMonths', case when i.status = 'PAID' then pi.bundle end
  ) order by s.full_name), '[]'::jsonb)
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  left join public.payment_invoices i
    on i.student_id = s.id and i.year = p_year and i.month = p_month
  left join lateral (
    select coalesce(t.submitted_at, t.confirmed_at) as paid_on,
           t.payer_name, t.payer_profile_id as payer_id,
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

-- ---------------------------------------------------------------------------
-- 5. payment_wali_history — RIWAYAT INFAK PER BULAN untuk tiap anak.
--    Satu baris per tagihan/bulan walau dibayar sekaligus untuk beberapa
--    bulan; keterangan: dibayarkan tanggal berapa, oleh siapa, dan apakah
--    dibayar di muka / sekaligus N bulan.
-- ---------------------------------------------------------------------------
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
              'paidBySelf', (i.status = 'PAID' and pi.payer_id is not null and pi.payer_id = auth.uid()),
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
                   t.payer_name, t.payer_profile_id as payer_id, t.reference,
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

grant execute on function
  public.payment_submit_proof(uuid, text, text),
  public.payment_initiate(jsonb, text),
  public.payment_wali_invoices(integer, integer),
  public.payment_wali_status(integer, integer),
  public.payment_wali_history(integer)
to authenticated;
