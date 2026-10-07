-- ============================================================================
-- TAHFIZH V65 — Infak "atas nama": santri sendiri wajib atas nama sendiri
-- ============================================================================
-- Aturan: bila pembayaran mencakup tagihan SANTRI SENDIRI (anak dari akun ini),
-- maka infak WAJIB tercatat atas nama diri sendiri — tidak boleh memakai nama
-- lain / "Hamba Allah". Nama lain hanya boleh dipakai bila SELURUH tagihan
-- yang dibayar adalah untuk santri LAIN.
--
-- Ditegakkan di server (payment_initiate): begitu ada satu saja item milik
-- santri sendiri, p_payer_alias diabaikan (dipaksa NULL) sehingga tampil
-- sebagai nama asli pembayar. Klien tidak bisa memaksa nama lain lewat API.
--
-- Idempoten: drop + create ulang. Struktur & validasi lain tidak berubah.
-- ============================================================================

drop function if exists public.payment_initiate(jsonb, text, text);

create or replace function public.payment_initiate(
  p_items jsonb,                       -- [{studentId, y, m, amount}]
  p_method text,                       -- MANUAL | IPAYMU
  p_payer_alias text default null      -- "atas nama" (opsional; hanya utk santri lain)
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
  v_own_ids uuid[] := '{}';
  v_has_own boolean := false;
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

  -- V65 — santri milik akun ini (anak sendiri).
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

    -- V65 — tandai bila ada tagihan santri sendiri.
    if v_student.id = any (v_own_ids) then v_has_own := true; end if;

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

  -- V65 — ada tagihan santri sendiri → wajib atas nama diri sendiri.
  if v_has_own then v_alias := null; end if;

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

grant execute on function public.payment_initiate(jsonb, text, text) to authenticated;
