-- ============================================================================
-- TAHFIZH V66 — Infak "atas nama" campuran (diri sendiri + santri lain)
-- ============================================================================
-- Aturan lengkap:
--   * Seluruh tagihan untuk SANTRI SENDIRI  → wajib atas nama diri sendiri
--     (nama lain tidak boleh) — dipertahankan dari V65.
--   * Pembayaran memuat SANTRI LAIN (sendiri saja, lain saja, atau campuran)
--     → nama lain / custom DIIZINKAN untuk bagian santri lain.
--
-- Karena satu transaksi hanya punya satu payer_alias, nama tampil disimpan
-- PER-ALOKASI (payment_allocations.payer_alias): bagian santri sendiri selalu
-- nama akun, bagian santri lain memakai nama yang dipilih. Tampilan ke santri
-- (payment_wali_status / payment_wali_history) memakai nama per-alokasi bila
-- ada, lalu jatuh ke payer_alias/payer_name transaksi (data lama tetap sama).
--
-- Idempoten: tambah kolom bila belum ada + drop/create ulang fungsi.
-- ============================================================================

-- 1. Kolom nama tampil per alokasi -------------------------------------------
alter table public.payment_allocations
  add column if not exists payer_alias text;

comment on column public.payment_allocations.payer_alias is
  'V66: nama yang ditampilkan sebagai pembayar untuk tagihan ini (bagian santri '
  'sendiri = nama akun; santri lain = nama pilihan). NULL = pakai transaksi.';

-- 2. payment_initiate — izinkan nama lain bila ada santri lain ---------------
drop function if exists public.payment_initiate(jsonb, text, text);

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
  v_display text;
  v_own_ids uuid[] := '{}';
  v_has_own boolean := false;
  v_has_other boolean := false;
  v_seen text[] := '{}';
  v_invoice_ids uuid[] := '{}';
  v_amounts integer[] := '{}';
  v_item_own boolean[] := '{}';
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

  -- Santri milik akun ini (anak sendiri).
  select coalesce(array_agg(distinct gs.student_id), '{}') into v_own_ids
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  where g.profile_id = v_profile.id;

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

    if v_student.id = any (v_own_ids) then
      v_has_own := true;
    else
      v_has_other := true;
    end if;

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
    v_item_own    := v_item_own || (v_student.id = any (v_own_ids));
    v_total       := v_total + v_amount;
  end loop;

  -- Nama lain hanya bila SELURUH item untuk santri sendiri yang dilarang.
  if v_has_own and not v_has_other then v_alias := null; end if;

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
    -- Nama tampil per tagihan: santri sendiri = nama akun; santri lain = nama dipilih.
    v_display := case
      when v_item_own[n] then v_profile.full_name
      else coalesce(v_alias, v_profile.full_name)
    end;

    insert into public.payment_allocations (transaction_id, invoice_id, tenant_id, amount, payer_alias)
    values (v_tx_id, v_invoice_ids[n], v_profile.tenant_id, v_amounts[n], v_display);

    update public.payment_invoices set status = 'PENDING', updated_at = now()
    where id = v_invoice_ids[n] and status <> 'PAID';
  end loop;

  return jsonb_build_object(
    'transaction_id', v_tx_id, 'reference', v_reference,
    'total', v_total, 'items', array_length(v_invoice_ids, 1)
  );
end;
$$;

grant execute on function public.payment_initiate(jsonb, text, text) to authenticated;

-- 3. payment_wali_status — nama pembayar per alokasi -------------------------
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
           coalesce(nullif(btrim(coalesce(a.payer_alias, '')), ''),
                    nullif(btrim(coalesce(t.payer_alias, '')), ''),
                    t.payer_name) as payer_name,
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

grant execute on function public.payment_wali_status(integer, integer) to authenticated;

-- 4. payment_wali_history — nama pembayar per alokasi ------------------------
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
                   coalesce(nullif(btrim(coalesce(a.payer_alias, '')), ''),
                            nullif(btrim(coalesce(t.payer_alias, '')), ''),
                            t.payer_name) as payer_name,
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

grant execute on function public.payment_wali_history(integer) to authenticated;
