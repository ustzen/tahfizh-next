-- ============================================================================
-- TAHFIZH V10 — INFAK PENGEMBANGAN, PEMBAYARAN, WHATSAPP, KRITIK & SARAN
-- ============================================================================
-- Contents:
--   1. payment_settings    rekening/QRIS/instruksi per tenant (rule #14/#33/#79)
--   2. payment_invoices    tagihan bulanan per santri (unique tenant+student+
--                          academic_year+year+month, rule #99) — histori penuh
--   3. payment_transactions  MANUAL / IPAYMU, status lengkap (rule #21)
--   4. payment_allocations alokasi transaksi → tagihan (multi-bulan/multi-
--                          santri, overpayment ≠ bulan, rule #38/#106)
--   5. payment_webhooks    audit + IDEMPOTENCY provider (unique sid, rule #20)
--   6. feedback            kritik/saran/error/feature (rule #45-#53)
--   7. notifications       notification center (rule #59/#60)
--   8. halaqahs.whatsapp_group_url (rule #42)
--   9. storage bucket payment-proofs (tenant isolated, rule #71)
--  10. RPCs SECURITY DEFINER (server authorization, rule #36/#47):
--     payment_settings_get / payment_settings_save
--     invoice_ensure_month (idempotent generator, cron + fallback)
--     invoice_mark_overdue
--     wali_payment_gate (rule #66: tanggal ≥16 & belum lunas → locked)
--     payment_initiate (server recomputes amounts, rule #100-#105)
--     payment_submit_proof / payment_mark_paid_auto / payment_expire_auto
--     payment_admin_confirm (atomic: transaction + allocations + invoices)
--     payment_admin_list / payment_admin_detail / payment_admin_summary
--     payment_wali_transactions / payment_wali_invoices / payment_unpaid_students
--     payment_cancel_transaction
--     feedback_submit / feedback_recipient_list / feedback_dev_list
--     feedback_own_list / feedback_set_status / feedback_forward
--     notification_push / notification_list / notification_mark_read / notification_unread_count
--     v10_admin_dashboard / v10_wali_dashboard / v10_dev_dashboard
--  11. RLS on every table (rule #34/#35/#85)
-- Timezone rules (#64): Asia/Jakarta — tagihan tgl 1, jatuh tempo 15, lock 16.
-- ============================================================================

create table if not exists public.payment_settings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references public.tenants (id) on delete cascade,
  default_amount      integer not null default 1000 check (default_amount >= 1000),
  bank_name           text,
  bank_account_no     text,
  bank_account_name   text,
  qris_path           text,                       -- storage path in payment-proofs
  instructions        text,
  confirm_note        text,                       -- teks informasi tambahan
  confirm_deadline_days integer not null default 3 check (confirm_deadline_days between 1 and 14),
  updated_by          uuid references public.profiles (id),
  updated_at          timestamptz not null default now()
);

create table if not exists public.payment_invoices (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  academic_year       text not null,              -- contoh: 2026/2027
  year                integer not null check (year between 2020 and 2100),
  month               integer not null check (month between 1 and 12),
  amount              integer not null check (amount >= 1000),   -- rule #101
  status              text not null default 'UNPAID'
                      check (status in ('UNPAID','PENDING','WAITING_CONFIRM','PAID')),
  paid_at             timestamptz,
  paid_via            text,                       -- MANUAL / IPAYMU
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, student_id, academic_year, year, month)   -- rule #99
);

create index if not exists payment_invoices_tenant_idx   on public.payment_invoices (tenant_id);
create index if not exists payment_invoices_student_idx  on public.payment_invoices (student_id);
create index if not exists payment_invoices_status_idx   on public.payment_invoices (status);
create index if not exists payment_invoices_period_idx   on public.payment_invoices (academic_year, year, month);
create index if not exists payment_invoices_created_idx  on public.payment_invoices (created_at);

create table if not exists public.payment_transactions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  payer_profile_id    uuid not null references public.profiles (id),
                    -- identitas pembayar (bisa wali santri lain), rule #28
  payer_name          text not null,
  method              text not null check (method in ('MANUAL','IPAYMU')),
  total_amount        integer not null check (total_amount >= 1000),
  status              text not null default 'PENDING'
                      check (status in ('PENDING','WAITING_CONFIRM','PAID','REJECTED','EXPIRED','CANCELLED')),
  reference           text not null unique,       -- reference_id untuk provider
  provider_session_id text,                       -- iPaymu sid / session
  provider_trx_id     text,
  provider_paid_via   text,
  proof_path          text,                       -- storage path (MANUAL)
  payer_note          text,
  reject_reason       text,
  confirmed_by        uuid references public.profiles (id),
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists payment_transactions_tenant_idx  on public.payment_transactions (tenant_id);
create index if not exists payment_transactions_payer_idx   on public.payment_transactions (payer_profile_id);
create index if not exists payment_transactions_status_idx  on public.payment_transactions (status);
create index if not exists payment_transactions_created_idx on public.payment_transactions (created_at);

create table if not exists public.payment_allocations (
  id                  uuid primary key default gen_random_uuid(),
  transaction_id      uuid not null references public.payment_transactions (id) on delete cascade,
  invoice_id          uuid not null references public.payment_invoices (id) on delete cascade,
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  amount              integer not null check (amount >= 1000),
  created_at          timestamptz not null default now(),
  unique (transaction_id, invoice_id)             -- rule #99: no double allocation
);

create index if not exists payment_allocations_invoice_idx on public.payment_allocations (invoice_id);
create index if not exists payment_allocations_tenant_idx  on public.payment_allocations (tenant_id);

create table if not exists public.payment_webhooks (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'IPAYMU',
  provider_trx_id     text not null,
  sid                 text,
  reference_id        text,
  status_code         integer,
  payload             jsonb not null,
  processed           boolean not null default false,
  note                text,
  created_at          timestamptz not null default now(),
  unique (provider, provider_trx_id, sid)         -- IDEMPOTENCY (rule #20/#115)
);

create table if not exists public.feedback (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants (id) on delete cascade,  -- null = platform
  sender_profile_id   uuid references public.profiles (id) on delete set null,
  sender_name         text not null,              -- snapshot saat submit (audit #53)
  category            text not null check (category in
                      ('KRITIK','SARAN','LAPORAN_ERROR','PERMINTAAN_FITUR','PENGEMBANGAN','LAINNYA')),
  target_type         text not null check (target_type in
                      ('USTADZ','KOORDINATOR','ADMIN','LEMBAGA','DEVELOPER')),
  target_teacher_id   uuid references public.teachers (id) on delete set null,
  title               text not null check (char_length(btrim(title)) between 3 and 160),
  content             text not null check (char_length(btrim(content)) between 5 and 4000),
  page_url            text,                       -- LAPORAN_ERROR (#86)
  steps               text,
  is_anonymous        boolean not null default false,
  status              text not null default 'BARU'
                      check (status in ('BARU','DIBACA','DIPROSES','SELESAI','DITOLAK')),
  response            text,
  responded_by        uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists feedback_tenant_idx   on public.feedback (tenant_id);
create index if not exists feedback_sender_idx   on public.feedback (sender_profile_id);
create index if not exists feedback_target_idx   on public.feedback (target_type, target_teacher_id);
create index if not exists feedback_status_idx   on public.feedback (status);
create index if not exists feedback_created_idx  on public.feedback (created_at);

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  tenant_id           uuid references public.tenants (id) on delete cascade,
  type                text not null check (type in
                      ('PAYMENT_SUBMITTED','PAYMENT_CONFIRMED','PAYMENT_REJECTED','FEEDBACK_NEW','INFO')),
  title               text not null,
  body                text not null default '',
  link                text,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists notifications_user_idx      on public.notifications (user_id, read_at);
create index if not exists notifications_created_idx   on public.notifications (created_at);
create index if not exists notifications_tenant_idx    on public.notifications (tenant_id);

-- WhatsApp grup per halaqah (rule #42) — kolom, bukan tabel baru.
alter table public.halaqahs
  add column if not exists whatsapp_group_url text;

-- ============================================================================
-- STORAGE — payment-proofs bucket (bukti transfer & QRIS; rule #71/#34)
--   Path tenant-namespaced: {tenant_id}/proof-{transaction}.{ext} dan
--   {tenant_id}/qris.{ext}. Wali (tenant sama) boleh upload bukti; ADMIN
--   lembaga boleh baca/tulis QRIS; tenant lain tidak pernah bisa.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "payment proofs read tenant" on storage.objects;
drop policy if exists "payment proofs insert member" on storage.objects;
drop policy if exists "payment proofs update tenant" on storage.objects;
drop policy if exists "payment proofs delete tenant admin" on storage.objects;

create policy "payment proofs read tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "payment proofs insert member"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "payment proofs update tenant"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "payment proofs delete tenant admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

-- ============================================================================
-- HELPERS (timezone Asia/Jakarta, rule #64)
-- ============================================================================

create or replace function public.jakarta_now()
returns timestamptz language sql stable as $$
  select now() at time zone 'Asia/Jakarta'
$$;

-- (year, month, day-of-month, academic_year) "hari ini" versi Jakarta.
create or replace function public.jakarta_today()
returns table (y integer, m integer, d integer, ay text) language sql stable as $$
  select extract(year  from public.jakarta_now())::int,
         extract(month from public.jakarta_now())::int,
         extract(day   from public.jakarta_now())::int,
         case
           when extract(month from public.jakarta_now()) >= 7
             then extract(year from public.jakarta_now())::text || '/' ||
                  (extract(year from public.jakarta_now())::int + 1)::text
           else (extract(year from public.jakarta_now())::int - 1)::text || '/' ||
                extract(year from public.jakarta_now())::text
         end
$$;

-- ============================================================================
-- RPC — PAYMENT SETTINGS (ADMIN per tenant, rule #33/#79)
-- ============================================================================

create or replace function public.payment_settings_get()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_row public.payment_settings;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_row from public.payment_settings where tenant_id = v_profile.tenant_id;
  return jsonb_build_object(
    'default_amount',      coalesce(v_row.default_amount, 1000),
    'bank_name',           v_row.bank_name,
    'bank_account_no',     v_row.bank_account_no,
    'bank_account_name',   v_row.bank_account_name,
    'qris_path',           v_row.qris_path,
    'instructions',        v_row.instructions,
    'confirm_note',        v_row.confirm_note,
    'confirm_deadline_days', coalesce(v_row.confirm_deadline_days, 3)
  );
end;
$$;

create or replace function public.payment_settings_save(
  p_default_amount integer default null,
  p_bank_name      text default null,
  p_bank_no        text default null,
  p_bank_account   text default null,
  p_qris_path      text default null,
  p_instructions   text default null,
  p_confirm_note   text default null,
  p_deadline_days  integer default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  insert into public.payment_settings (
    tenant_id, default_amount, bank_name, bank_account_no, bank_account_name,
    qris_path, instructions, confirm_note, confirm_deadline_days, updated_by, updated_at
  ) values (
    v_profile.tenant_id,
    coalesce(p_default_amount, 1000),
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    nullif(btrim(coalesce(p_bank_no, '')), ''),
    nullif(btrim(coalesce(p_bank_account, '')), ''),
    coalesce(p_qris_path, ''),
    nullif(btrim(coalesce(p_instructions, '')), ''),
    nullif(btrim(coalesce(p_confirm_note, '')), ''),
    coalesce(p_deadline_days, 3),
    auth.uid(), now()
  )
  on conflict (tenant_id) do update set
    default_amount        = coalesce(p_default_amount, payment_settings.default_amount),
    bank_name             = coalesce(nullif(btrim(coalesce(p_bank_name, '')), ''), payment_settings.bank_name),
    bank_account_no       = coalesce(nullif(btrim(coalesce(p_bank_no, '')), ''), payment_settings.bank_account_no),
    bank_account_name     = coalesce(nullif(btrim(coalesce(p_bank_account, '')), ''), payment_settings.bank_account_name),
    qris_path             = coalesce(p_qris_path, payment_settings.qris_path),
    instructions          = coalesce(nullif(btrim(coalesce(p_instructions, '')), ''), payment_settings.instructions),
    confirm_note          = coalesce(nullif(btrim(coalesce(p_confirm_note, '')), ''), payment_settings.confirm_note),
    confirm_deadline_days = coalesce(p_deadline_days, payment_settings.confirm_deadline_days),
    updated_by            = auth.uid(),
    updated_at            = now();
end;
$$;

-- ============================================================================
-- RPC — INVOICE GENERATION (idempotent, rule #65/#99)
-- ============================================================================

-- Buat tagihan bulan (y,m) untuk semua santri ACTIVE tenant.
-- Idempotent: ON CONFLICT DO NOTHING → aman dipanggil cron/berulang.
create or replace function public.invoice_ensure_month(
  p_year  integer default null,
  p_month integer default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
  v_count integer := 0;
  v_default integer := 1000;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_today from public.jakarta_today();
  p_year  := coalesce(p_year, v_today.y);
  p_month := coalesce(p_month, v_today.m);

  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;

  if v_profile.role = 'ADMIN' then
    if v_profile.tenant_id is null then raise exception 'AKSES_DITOLAK'; end if;
    select coalesce(default_amount, 1000) into v_default from public.payment_settings
      where tenant_id = v_profile.tenant_id;

    with ins as (
      insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
      select v_profile.tenant_id, s.id,
             case when p_month >= 7 then p_year::text || '/' || (p_year + 1)::text
                  else (p_year - 1)::text || '/' || p_year::text end,
             p_year, p_month, v_default
      from public.students s
      where s.tenant_id = v_profile.tenant_id and s.status = 'ACTIVE'
      on conflict (tenant_id, student_id, academic_year, year, month) do nothing
      returning 1
    )
    select count(*) into v_count from ins;
    return v_count;
  end if;

  -- Platform cron (service role / developer): seluruh tenant.
  if v_profile.role = 'DEVELOPER' then
    with ins as (
      insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
      select t.id, s.id,
             case when p_month >= 7 then p_year::text || '/' || (p_year + 1)::text
                  else (p_year - 1)::text || '/' || p_year::text end,
             p_year, p_month,
             coalesce(ps.default_amount, 1000)
      from public.tenants t
      join public.students s on s.tenant_id = t.id and s.status = 'ACTIVE'
      left join public.payment_settings ps on ps.tenant_id = t.id
      where t.status = 'ACTIVE'
      on conflict (tenant_id, student_id, academic_year, year, month) do nothing
      returning 1
    )
    select count(*) into v_count from ins;
    return v_count;
  end if;

  raise exception 'AKSES_DITOLAK';
end;
$$;

-- Cron: tandai invoice UNPAID bulan lalu sebagai kedaluwarsa-visual tidak
-- perlu kolom baru — status tetap UNPAID; gate & laporan membaca year/month.
-- RPC ini hanya menjaga PENDING iPaymu kedaluwarsa (fallback jika webhook absen).
create or replace function public.invoice_mark_overdue()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
begin
  -- iPaymu PENDING lebih lama dari 1 hari → EXPIRED + alokasi kembali UNPAID.
  with exp as (
    update public.payment_transactions t
    set status = 'EXPIRED', updated_at = now()
    where t.method = 'IPAYMU' and t.status = 'PENDING'
      and t.created_at < now() - interval '24 hours'
    returning t.id
  )
  select count(*) into v_count from exp;

  update public.payment_invoices i
  set status = 'UNPAID', updated_at = now()
  where i.status in ('PENDING') and not exists (
    select 1 from public.payment_allocations a
    join public.payment_transactions t on t.id = a.transaction_id
    where a.invoice_id = i.id and t.status in ('PENDING','WAITING_CONFIRM')
  );
  return v_count;
end;
$$;

-- ============================================================================
-- RPC — WALI PAYMENT GATE (rule #7/#8/#66: tanggal ≥16 & belum lunas → lock)
-- ============================================================================

create or replace function public.wali_payment_gate()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
  v_guardian public.guardians;
  v_unpaid integer;
  v_min integer := 1000;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then
    return jsonb_build_object('locked', false, 'applicable', false);
  end if;

  select * into v_today from public.jakarta_today();
  select * into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is null then
    return jsonb_build_object('locked', false, 'applicable', false);
  end if;

  select coalesce(default_amount, 1000) into v_min from public.payment_settings
    where tenant_id = v_profile.tenant_id;

  -- Tagihan bulan BERJALAN anak-anak wali ini (hanya anak sendiri → gate).
  select count(*) into v_unpaid
  from public.payment_invoices i
  join public.guardian_students gs on gs.student_id = i.student_id
  where gs.guardian_id = v_guardian.id
    and i.year = v_today.y and i.month = v_today.m
    and i.status <> 'PAID';

  return jsonb_build_object(
    'locked',        v_today.d >= 16 and v_unpaid > 0,
    'applicable',    true,
    'day',           v_today.d,
    'unpaid_count',  v_unpaid,
    'min_amount',    v_min,
    'month',         v_today.m,
    'year',          v_today.y,
    'month_label',   to_char(make_date(v_today.y, v_today.m, 1), 'TMMonth YYYY'),
    'academic_year', v_today.ay
  );
end;
$$;

-- ============================================================================
-- RPC — PAYMENT INITIATE (server recompute, rule #100-#106, #37)
-- ============================================================================

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
  v_tx_id uuid;
  v_total integer := 0;
  v_reference text;
  v_settings public.payment_settings;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_method not in ('MANUAL','IPAYMU') then raise exception 'METODE_TIDAK_VALID'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEM_KOSONG';
  end if;

  select * into v_settings from public.payment_settings where tenant_id = v_profile.tenant_id;

  -- Validasi seluruh item SEBELUM membuat transaksi (rule #37/#100).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item->>'studentId' is null or (v_item->>'y')::int is null or (v_item->>'m')::int is null then
      raise exception 'ITEM_TIDAK_VALID';
    end if;
    if (v_item->>'amount')::int is null or (v_item->>'amount')::int < 1000 then
      raise exception 'NOMINAL_MINIMAL';                       -- rule #101/#103
    end if;

    select * into v_student from public.students
      where id = (v_item->>'studentId')::uuid and tenant_id = v_profile.tenant_id and status = 'ACTIVE';
    if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;  -- rule #37 same-tenant

    select * into v_invoice from public.payment_invoices
      where tenant_id = v_profile.tenant_id
        and student_id = (v_item->>'studentId')::uuid
        and year = (v_item->>'y')::int and month = (v_item->>'m')::int;
    if v_invoice is null then raise exception 'TAGIHAN_TIDAK_DITEMUKAN'; end if;
    if v_invoice.status = 'PAID' then raise exception 'SUDAH_LUNAS'; end if;     -- rule #37
    if exists (
      select 1 from public.payment_allocations a
      join public.payment_transactions t on t.id = a.transaction_id
      where a.invoice_id = v_invoice.id and t.status in ('PENDING','WAITING_CONFIRM')
    ) then raise exception 'MENUNGGU_PEMBAYARAN'; end if;
    if (v_item->>'amount')::int < v_invoice.amount then
      raise exception 'NOMINAL_KURANG';   -- kurang dari tagihan bulan tsb ditolak
    end if;

    v_total := v_total + (v_item->>'amount')::int;
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

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.payment_allocations (transaction_id, invoice_id, tenant_id, amount)
    select v_tx_id, i.id, v_profile.tenant_id, (v_item->>'amount')::int
    from public.payment_invoices i
    where i.tenant_id = v_profile.tenant_id
      and i.student_id = (v_item->>'studentId')::uuid
      and i.year = (v_item->>'y')::int and i.month = (v_item->>'m')::int;

    update public.payment_invoices set status = 'PENDING', updated_at = now()
    where tenant_id = v_profile.tenant_id
      and student_id = (v_item->>'studentId')::uuid
      and year = (v_item->>'y')::int and month = (v_item->>'m')::int and status <> 'PAID';
  end loop;

  return jsonb_build_object('transaction_id', v_tx_id, 'reference', v_reference, 'total', v_total);
end;
$$;

-- Wali melampirkan bukti transfer (MANUAL → WAITING_CONFIRM, rule #16).
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
      payer_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
  where id = p_transaction_id;

  update public.payment_invoices i set status = 'WAITING_CONFIRM', updated_at = now()
  where i.status <> 'PAID' and exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = p_transaction_id
  );

  -- Notifikasi ke ADMIN lembaga (rule #59).
  insert into public.notifications (user_id, tenant_id, type, title, body, link)
  select id, v_tx.tenant_id, 'PAYMENT_SUBMITTED',
         'Pembayaran menunggu konfirmasi',
         v_profile.full_name || ' mengirim bukti pembayaran infak.',
         '/admin/infak/' || v_tx.id::text
  from public.profiles
  where tenant_id = v_tx.tenant_id and role = 'ADMIN';
end;
$$;

-- Wali membatalkan transaksi PENDING miliknya.
create or replace function public.payment_cancel_transaction(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_tx from public.payment_transactions
    where id = p_transaction_id and payer_profile_id = v_profile.id and tenant_id = v_profile.tenant_id;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.status <> 'PENDING' then raise exception 'STATUS_TIDAK_DAPAT_DIUBAH'; end if;

  update public.payment_transactions set status = 'CANCELLED', updated_at = now() where id = p_transaction_id;
  update public.payment_invoices i set status = 'UNPAID', updated_at = now()
  where i.status <> 'PAID' and exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = p_transaction_id
  );
end;
$$;

-- WEBHOOK (server only): tandai LUNAS secara ATOMIK (rule #18/#83).
-- Idempotent: transaksi sudah PAID → no-op (rule #20/#115).
create or replace function public.payment_mark_paid_auto(
  p_reference text,
  p_trx_id    text,
  p_via       text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions where reference = p_reference for update;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.status = 'PAID' then return; end if;                    -- idempotent

  update public.payment_transactions
  set status = 'PAID', provider_trx_id = p_trx_id, provider_paid_via = p_via,
      confirmed_at = now(), confirmed_by = null, updated_at = now()
  where id = v_tx.id;

  -- Alokasi: setiap bulan mendapat pelunasan sendiri (rule #38).
  update public.payment_invoices i
  set status = 'PAID', paid_at = now(), paid_via = 'IPAYMU', updated_at = now()
  where exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = v_tx.id
  );

  insert into public.notifications (user_id, tenant_id, type, title, body, link)
  values (v_tx.payer_profile_id, v_tx.tenant_id, 'PAYMENT_CONFIRMED',
          'Pembayaran berhasil dikonfirmasi',
          'Infak Pengembangan sebesar Rp' || v_tx.total_amount::text || ' telah kami terima. Terima kasih.',
          '/wali/infak/' || v_tx.id::text);
end;
$$;

-- WEBHOOK: iPaymu expired → transaksi kedaluwarsa, tagihan kembali UNPAID.
create or replace function public.payment_expire_auto(p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions where reference = p_reference for update;
  if v_tx is null then return; end if;
  if v_tx.status <> 'PENDING' then return; end if;

  update public.payment_transactions set status = 'EXPIRED', updated_at = now() where id = v_tx.id;
  update public.payment_invoices i set status = 'UNPAID', updated_at = now()
  where i.status <> 'PAID' and exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = v_tx.id
  );
end;
$$;

-- ADMIN confirm/reject manual — ATOMIK (rule #17/#83/#116).
create or replace function public.payment_admin_confirm(
  p_transaction_id uuid,
  p_decision text,      -- APPROVE | REJECT
  p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_tx from public.payment_transactions
    where id = p_transaction_id and tenant_id = v_profile.tenant_id for update;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.status not in ('WAITING_CONFIRM') then raise exception 'STATUS_TIDAK_DAPAT_DIUBAH'; end if;

  if p_decision = 'APPROVE' then
    update public.payment_transactions
    set status = 'PAID', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
    where id = v_tx.id;

    update public.payment_invoices i
    set status = 'PAID', paid_at = now(), paid_via = 'MANUAL', updated_at = now()
    where exists (
      select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = v_tx.id
    );

    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    values (v_tx.payer_profile_id, v_tx.tenant_id, 'PAYMENT_CONFIRMED',
            'Pembayaran berhasil dikonfirmasi',
            'Pembayaran infak Anda telah dikonfirmasi admin. Jazakumullahu khairan.',
            '/wali/infak/' || v_tx.id::text);
  elsif p_decision = 'REJECT' then
    update public.payment_transactions
    set status = 'REJECTED', reject_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        confirmed_by = auth.uid(), updated_at = now()
    where id = v_tx.id;

    update public.payment_invoices i set status = 'UNPAID', updated_at = now()
    where i.status <> 'PAID' and exists (
      select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = v_tx.id
    );

    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    values (v_tx.payer_profile_id, v_tx.tenant_id, 'PAYMENT_REJECTED',
            'Pembayaran belum dapat dikonfirmasi',
            coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Bukti pembayaran tidak dapat diverifikasi. Silakan ajukan ulang.'),
            '/wali/infak/' || v_tx.id::text);
  else
    raise exception 'KEPUTUSAN_TIDAK_VALID';
  end if;
end;
$$;

-- ============================================================================
-- RPC — LIST / DETAIL / SUMMARY
-- ============================================================================

-- Tagihan milik anak-anak wali + pilihan nominal default (rule #61/#62).
create or replace function public.payment_wali_invoices(p_year integer default null, p_month integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
  v_settings public.payment_settings;
  v_children jsonb;
  v_others jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  p_year := coalesce(p_year, v_today.y); p_month := coalesce(p_month, v_today.m);
  select * into v_settings from public.payment_settings where tenant_id = v_profile.tenant_id;

  select * into v_guardian from public.guardians where profile_id = v_profile.id;

  select coalesce(jsonb_agg(x order by x.n), '[]'::jsonb) into v_children
  from (
    select jsonb_build_object(
      'studentId', s.id, 'name', s.full_name, 'code', s.business_code,
      'invoices', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', i.id, 'y', i.year, 'm', i.month,
                 'amount', i.amount, 'status', i.status,
                 'paidAt', i.paid_at, 'paidVia', i.paid_via
               ) order by i.year desc, i.month desc), '[]'::jsonb)
        from public.payment_invoices i
        where i.student_id = s.id and i.status <> 'PAID'
      ),
      'n', s.full_name
    ) x
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
    where v_guardian is not null and gs.guardian_id = v_guardian.id
  ) t;

  -- Santri lain di lembaga yang belum lunas bulan berjalan (rule #24/#25/#27:
  -- hanya nama + ID, tanpa data sensitif).
  select coalesce(jsonb_agg(jsonb_build_object('studentId', s.id, 'name', s.full_name, 'code', s.business_code)
               order by s.full_name), '[]'::jsonb) into v_others
  from public.students s
  where s.tenant_id = v_profile.tenant_id and s.status = 'ACTIVE'
    and (v_guardian is null or s.id not in (
      select gs.student_id from public.guardian_students gs where gs.guardian_id = v_guardian.id))
    and exists (
      select 1 from public.payment_invoices i
      where i.student_id = s.id and i.year = v_today.y and i.month = v_today.m and i.status <> 'PAID'
    );

  return jsonb_build_object(
    'children', v_children,
    'others', v_others,
    'defaultAmount', coalesce(v_settings.default_amount, 1000),
    'y', p_year, 'm', p_month, 'academicYear', v_today.ay,
    'bank', jsonb_build_object(
      'bankName', v_settings.bank_name, 'bankNo', v_settings.bank_account_no,
      'bankAccount', v_settings.bank_account_name, 'instructions', v_settings.instructions,
      'confirmNote', v_settings.confirm_note, 'qrisPath', v_settings.qris_path
    )
  );
end;
$$;

-- Riwayat transaksi wali (rule #29).
create or replace function public.payment_wali_transactions()
returns table (
  id uuid, reference text, method text, status text, total_amount integer,
  payer_name text, proof_path text, reject_reason text,
  created_at timestamptz, confirmed_at timestamptz,
  allocations jsonb
) language sql security definer set search_path = public as $$
  select t.id, t.reference, t.method, t.status, t.total_amount, t.payer_name,
         t.proof_path, t.reject_reason, t.created_at, t.confirmed_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'student', s.full_name, 'code', s.business_code,
                    'y', i.year, 'm', i.month, 'amount', a.amount, 'invoiceStatus', i.status
                  ) order by i.year, i.month)
           from public.payment_allocations a
           join public.payment_invoices i on i.id = a.invoice_id
           join public.students s on s.id = i.student_id
           where a.transaction_id = t.id
         ), '[]'::jsonb)
  from public.payment_transactions t
  where t.payer_profile_id = auth.uid()
  order by t.created_at desc
$$;

-- Tagihan bulanan anak-anak wali utk kartu dashboard (rule #61/#62).
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
    'hasInvoice', i.id is not null
  ) order by s.full_name), '[]'::jsonb)
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  left join public.payment_invoices i
    on i.student_id = s.id and i.year = p_year and i.month = p_month
  where v_guardian is not null and gs.guardian_id = v_guardian.id);
end;
$$;

-- Daftar pembayaran tenant utk ADMIN (rule #30/#31).
create or replace function public.payment_admin_list(
  p_status text default 'ALL',
  p_query  text default null
)
returns table (
  id uuid, reference text, payer_name text, method text, status text,
  total_amount integer, proof_path text, has_proof boolean,
  student_summary text, created_at timestamptz, confirmed_at timestamptz
) language sql security definer set search_path = public as $$
  with me as (select tenant_id from public.profiles where id = auth.uid())
  select t.id, t.reference, t.payer_name, t.method, t.status, t.total_amount,
         t.proof_path, (t.proof_path is not null) as has_proof,
         (
           select string_agg(distinct s.full_name, ', ')
           from public.payment_allocations a
           join public.payment_invoices i on i.id = a.invoice_id
           join public.students s on s.id = i.student_id
           where a.transaction_id = t.id
         ) as student_summary,
         t.created_at, t.confirmed_at
  from public.payment_transactions t, me
  where t.tenant_id = (select tenant_id from me)
    and (p_status = 'ALL' or t.status = p_status)
    and (p_query is null or t.payer_name ilike '%' || p_query || '%' or t.reference ilike '%' || p_query || '%')
  order by t.created_at desc
  limit 200
$$;

-- Detail transaksi utk ADMIN (rule #32) — termasuk alokasi per bulan/santri.
create or replace function public.payment_admin_detail(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_tx from public.payment_transactions
    where id = p_transaction_id and tenant_id = v_profile.tenant_id;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;

  return jsonb_build_object(
    'id', v_tx.id, 'reference', v_tx.reference, 'payerName', v_tx.payer_name,
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

-- Detail transaksi milik wali sendiri (bukti/receipt, rule #73/#74).
create or replace function public.payment_wali_detail(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_tx public.payment_transactions;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_tx from public.payment_transactions
    where id = p_transaction_id and payer_profile_id = v_profile.id;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;

  return jsonb_build_object(
    'id', v_tx.id, 'reference', v_tx.reference, 'payerName', v_tx.payer_name,
    'method', v_tx.method, 'status', v_tx.status, 'total', v_tx.total_amount,
    'proofPath', v_tx.proof_path, 'payerNote', v_tx.payer_note,
    'rejectReason', v_tx.reject_reason, 'createdAt', v_tx.created_at,
    'confirmedAt', v_tx.confirmed_at,
    'allocations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'student', s.full_name, 'code', s.business_code,
               'y', i.year, 'm', i.month, 'amount', a.amount, 'invoiceStatus', i.status
             ) order by i.year, i.month), '[]'::jsonb)
      from public.payment_allocations a
      join public.payment_invoices i on i.id = a.invoice_id
      join public.students s on s.id = i.student_id
      where a.transaction_id = v_tx.id
    )
  );
end;
$$;

-- Ringkasan admin (rule #30/#108).
create or replace function public.payment_admin_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_today from public.jakarta_today();

  select jsonb_build_object(
    'monthLabel', to_char(make_date(v_today.y, v_today.m, 1), 'TMMonth YYYY'),
    'totalInvoices',  count(*) filter (where i.year = v_today.y and i.month = v_today.m),
    'paidCount',      count(*) filter (where i.year = v_today.y and i.month = v_today.m and i.status = 'PAID'),
    'unpaidCount',    count(*) filter (where i.year = v_today.y and i.month = v_today.m and i.status = 'UNPAID'),
    'waitingCount',   count(*) filter (where i.year = v_today.y and i.month = v_today.m and i.status in ('PENDING','WAITING_CONFIRM')),
    'collectedTotal', coalesce((
        select sum(t.total_amount) from public.payment_transactions t
        where t.tenant_id = v_profile.tenant_id and t.status = 'PAID'
      ), 0),
    'manualTotal', coalesce((
        select sum(t.total_amount) from public.payment_transactions t
        where t.tenant_id = v_profile.tenant_id and t.status = 'PAID' and t.method = 'MANUAL'
      ), 0),
    'autoTotal', coalesce((
        select sum(t.total_amount) from public.payment_transactions t
        where t.tenant_id = v_profile.tenant_id and t.status = 'PAID' and t.method = 'IPAYMU'
      ), 0),
    'pendingConfirm', (
        select count(*) from public.payment_transactions t
        where t.tenant_id = v_profile.tenant_id and t.status = 'WAITING_CONFIRM'
      )
  )
  into v_result
  from public.payment_invoices i
  where i.tenant_id = v_profile.tenant_id
  group by i.tenant_id;

  return coalesce(v_result, jsonb_build_object(
    'monthLabel', to_char(make_date(v_today.y, v_today.m, 1), 'TMMonth YYYY'),
    'totalInvoices', 0, 'paidCount', 0, 'unpaidCount', 0, 'waitingCount', 0,
    'collectedTotal', 0, 'manualTotal', 0, 'autoTotal', 0, 'pendingConfirm', 0
  ));
end;
$$;

-- ============================================================================
-- RPC — FEEDBACK (rule #45-#58, #85, #119, #120)
-- ============================================================================

create or replace function public.feedback_submit(
  p_category   text,
  p_target     text,
  p_title      text,
  p_content    text,
  p_teacher_id uuid default null,
  p_anonymous  boolean default false,
  p_page_url   text default null,
  p_steps      text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_id uuid;
  v_valid_teacher boolean := false;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  if p_category not in ('KRITIK','SARAN','LAPORAN_ERROR','PERMINTAAN_FITUR','PENGEMBANGAN','LAINNYA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;
  if p_target not in ('USTADZ','KOORDINATOR','ADMIN','LEMBAGA','DEVELOPER') then
    raise exception 'TUJUAN_TIDAK_VALID';
  end if;
  if btrim(p_title) = '' or btrim(p_content) = '' then raise exception 'ISI_WAJIB'; end if;

  if p_target = 'USTADZ' then
    if p_teacher_id is null then raise exception 'GURU_WAJIB'; end if;
    select count(*) > 0 into v_valid_teacher from public.teachers
      where id = p_teacher_id and tenant_id = v_profile.tenant_id;
    if not v_valid_teacher then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;
  end if;

  insert into public.feedback (
    tenant_id, sender_profile_id, sender_name, category, target_type, target_teacher_id,
    title, content, page_url, steps, is_anonymous
  ) values (
    v_profile.tenant_id, v_profile.id, v_profile.full_name, p_category, p_target, p_teacher_id,
    btrim(p_title), btrim(p_content),
    nullif(btrim(coalesce(p_page_url, '')), ''), nullif(btrim(coalesce(p_steps, '')), ''),
    coalesce(p_anonymous, false)
  )
  returning id into v_id;

  -- Notifikasi ke penerima (rule #59).
  if p_target = 'USTADZ' then
    -- teachers tidak punya profile_id → cocokkan nama (pola yang sama dengan
    -- modul ustadz lain di aplikasi ini); jika tidak ketemu, admin menerima.
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select p.id, v_profile.tenant_id, 'FEEDBACK_NEW', 'Kritik & Saran baru',
           'Anda menerima masukan baru dari ' || case when coalesce(p_anonymous, false) then 'Anonim' else v_profile.full_name end || '.',
           '/ustadz/saran'
    from public.teachers t
    join public.profiles p on p.role = 'USTADZ' and p.tenant_id = v_profile.tenant_id
         and lower(btrim(p.full_name)) = lower(btrim(t.full_name))
    where t.id = p_teacher_id;
  elsif p_target = 'KOORDINATOR' then
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select id, tenant_id, 'FEEDBACK_NEW', 'Kritik & Saran baru', 'Anda menerima masukan baru.', '/koordinator/saran'
    from public.profiles where tenant_id = v_profile.tenant_id and role = 'KOORDINATOR';
  elsif p_target = 'DEVELOPER' then
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select id, null, 'FEEDBACK_NEW', 'Kritik & Saran baru', 'Masukan baru untuk Developer.', '/developer/saran'
    from public.profiles where role = 'DEVELOPER';
  else
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    select id, tenant_id, 'FEEDBACK_NEW', 'Kritik & Saran baru', 'Anda menerima masukan baru.', '/admin/saran'
    from public.profiles where tenant_id = v_profile.tenant_id and role = 'ADMIN';
  end if;

  return v_id;
end;
$$;

-- Anonim: penerima biasa melihat "Anonim" (rule #50); DEVELOPER melihat
-- identitas ASLI untuk feedback target DEVELOPER (rule #51/#52).
create or replace function public.feedback_recipient_list()
returns table (
  id uuid, category text, target_type text, target_teacher text,
  title text, content text, page_url text, steps text,
  display_name text, status text, response text,
  created_at timestamptz, is_own boolean, can_moderate boolean
) language sql security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid())
  select f.id, f.category, f.target_type,
         (select t.full_name from public.teachers t where t.id = f.target_teacher_id),
         f.title, f.content, f.page_url, f.steps,
         case
           when not f.is_anonymous then f.sender_name
           when (select role from me) = 'DEVELOPER' and f.target_type = 'DEVELOPER' then f.sender_name  -- rule #51
           else 'Anonim'
         end as display_name,
         f.status, f.response, f.created_at,
         (f.sender_profile_id = (select id from me)) as is_own,
         ((select role from me) in ('ADMIN','DEVELOPER')) as can_moderate
  from public.feedback f
  where
    -- Pengirim selalu melihat miliknya.
    f.sender_profile_id = (select id from me)
    -- DEVELOPER: semua feedback target DEVELOPER (global) (rule #58).
    or ((select role from me) = 'DEVELOPER' and f.target_type = 'DEVELOPER')
    -- ADMIN: semua feedback lembaganya KECUALI target DEVELOPER (rule #120).
    or ((select role from me) = 'ADMIN' and f.tenant_id = (select tenant_id from me)
        and f.target_type in ('ADMIN','LEMBAGA','USTADZ','KOORDINATOR'))
    -- KOORDINATOR: target koordinator + masukan tentang guru (rule #56).
    or ((select role from me) = 'KOORDINATOR' and f.tenant_id = (select tenant_id from me)
        and f.target_type in ('KOORDINATOR','USTADZ'))
    -- USTADZ: feedback yang ditujukan kepadanya (rule #57).
    or ((select role from me) = 'USTADZ' and f.target_type = 'USTADZ' and exists (
          select 1 from public.teachers t
          join public.profiles p on p.role = 'USTADZ' and p.tenant_id = t.tenant_id
               and lower(btrim(p.full_name)) = lower(btrim(t.full_name))
          where t.id = f.target_teacher_id and p.id = (select id from me)))
  order by f.created_at desc
  limit 200
$$;

-- Developer global list + identitas asli utk target DEVELOPER (rule #58/#78).
create or replace function public.feedback_dev_list()
returns table (
  id uuid, tenant_code text, tenant_name text, category text,
  sender_name text, sender_email text, target_type text,
  title text, content text, page_url text, steps text,
  status text, response text, created_at timestamptz, is_anonymous boolean
) language sql security definer set search_path = public as $$
  select f.id, t.business_code, t.name, f.category,
         f.sender_name,                                    -- identitas asli (rule #51)
         -- profiles has no email column; the address lives in auth.users
         -- (profiles.id -> auth.users.id). (rule #51)
         (select u.email from auth.users u where u.id = f.sender_profile_id),
         f.target_type, f.title, f.content, f.page_url, f.steps,
         f.status, f.response, f.created_at, f.is_anonymous
  from public.feedback f
  left join public.tenants t on t.id = f.tenant_id
  where f.target_type = 'DEVELOPER'
  order by f.created_at desc
  limit 300
$$;

create or replace function public.feedback_set_status(
  p_feedback_id uuid,
  p_status      text,
  p_response    text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_fb public.feedback;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  if p_status not in ('BARU','DIBACA','DIPROSES','SELESAI','DITOLAK') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  select * into v_fb from public.feedback where id = p_feedback_id;
  if v_fb is null then raise exception 'FEEDBACK_TIDAK_DITEMUKAN'; end if;

  -- ADMIN: kelola feedback lembaganya (non-DEV). DEVELOPER: feedback DEV.
  if v_profile.role = 'ADMIN' then
    if v_fb.tenant_id is distinct from v_profile.tenant_id or v_fb.target_type = 'DEVELOPER' then
      raise exception 'AKSES_DITOLAK';
    end if;
  elsif v_profile.role = 'DEVELOPER' then
    if v_fb.target_type <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  else
    raise exception 'AKSES_DITOLAK';
  end if;

  update public.feedback
  set status = p_status, response = coalesce(nullif(btrim(coalesce(p_response, '')), ''), response),
      responded_by = auth.uid(), updated_at = now()
  where id = p_feedback_id;

  -- Notifikasi ke pengirim (rule #59).
  if v_fb.sender_profile_id is not null then
    insert into public.notifications (user_id, tenant_id, type, title, body, link)
    values (v_fb.sender_profile_id, v_fb.tenant_id, 'INFO',
            'Masukan Anda diperbarui',
            'Status masukan "' || v_fb.title || '" kini: ' || p_status || '.',
            case v_profile.role when 'DEVELOPER' then '/wali' else '/' || lower(v_profile.role) end);
  end if;
end;
$$;

-- ADMIN meneruskan masukan (rule #55): ubah target_type / target guru.
create or replace function public.feedback_forward(
  p_feedback_id uuid,
  p_target      text,
  p_teacher_id  uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_fb public.feedback;
  v_valid boolean := false;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_fb from public.feedback
    where id = p_feedback_id and tenant_id = v_profile.tenant_id;
  if v_fb is null then raise exception 'FEEDBACK_TIDAK_DITEMUKAN'; end if;
  if p_target not in ('USTADZ','KOORDINATOR','ADMIN','LEMBAGA','DEVELOPER') then
    raise exception 'TUJUAN_TIDAK_VALID';
  end if;
  if p_target = 'USTADZ' then
    select count(*) > 0 into v_valid from public.teachers
      where id = p_teacher_id and tenant_id = v_profile.tenant_id;
    if not v_valid then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;
  end if;

  update public.feedback
  set target_type = p_target, target_teacher_id = p_teacher_id, updated_at = now()
  where id = p_feedback_id;
end;
$$;

-- Opsi guru utk form wali (rule #48): nama + id, tenant sendiri.
create or replace function public.feedback_teacher_options()
returns table (id uuid, name text) language sql security definer set search_path = public as $$
  select t.id, t.full_name
  from public.teachers t
  where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  order by t.full_name
  limit 200
$$;

-- ============================================================================
-- RPC — NOTIFICATIONS (rule #59/#60)
-- ============================================================================

create or replace function public.notification_list(p_limit integer default 30)
returns table (
  id uuid, type text, title text, body text, link text,
  read_at timestamptz, created_at timestamptz
) language sql security definer set search_path = public as $$
  select n.id, n.type, n.title, n.body, n.link, n.read_at, n.created_at
  from public.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.notification_unread_count()
returns integer language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null
$$;

create or replace function public.notification_mark_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = now()
  where id = p_notification_id and user_id = auth.uid() and read_at is null;
end;
$$;

create or replace function public.notification_mark_all_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- ============================================================================
-- RPC — DASHBOARDS (rule #61-#63, #78)
-- ============================================================================

create or replace function public.v10_admin_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' then raise exception 'AKSES_DITOLAK'; end if;
  return public.payment_admin_summary();
end;
$$;

create or replace function public.v10_wali_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_gate jsonb;
  v_children jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  v_gate := public.wali_payment_gate();
  select public.payment_wali_status() into v_children;
  return jsonb_build_object('gate', v_gate, 'children', v_children);
end;
$$;

create or replace function public.v10_dev_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  return jsonb_build_object(
    'tenants',      (select count(*) from public.tenants),
    'transactions', (select count(*) from public.payment_transactions),
    'paidTotal',    (select coalesce(sum(total_amount), 0) from public.payment_transactions where status = 'PAID'),
    'feedbackNew',  (select count(*) from public.feedback where target_type = 'DEVELOPER' and status = 'BARU'),
    'feedbackAll',  (select count(*) from public.feedback where target_type = 'DEVELOPER'),
    'invoices',     (select count(*) from public.payment_invoices),
    'paidInvoices', (select count(*) from public.payment_invoices where status = 'PAID')
  );
end;
$$;

-- Daftar guru + WhatsApp wali utk tombol WhatsApp guru (rule #40/#41).
-- Mengembalikan santri binaan + nama wali + nomor wa tervalidasi-tenant.
create or replace function public.v10_teacher_whatsapp_directory()
returns table (
  student_id uuid, student_name text, student_code text,
  guardian_name text, guardian_whatsapp text
) language sql security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  my_teacher as (
    select t.id from public.teachers t
    where t.tenant_id = (select tenant_id from me)
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from me)))
    order by t.created_at desc limit 1
  )
  select s.id, s.full_name, s.business_code,
         (select p.full_name from public.guardian_students gs
            join public.guardians g on g.id = gs.guardian_id
            join public.profiles p on p.id = g.profile_id
          where gs.student_id = s.id order by gs.created_at limit 1),
         (select p.whatsapp from public.guardian_students gs
            join public.guardians g on g.id = gs.guardian_id
            join public.profiles p on p.id = g.profile_id
          where gs.student_id = s.id order by gs.created_at limit 1)
  from public.teacher_students ts
  join public.students s on s.id = ts.student_id and s.status = 'ACTIVE'
  where ts.teacher_id = (select id from my_teacher)
    and s.tenant_id = (select tenant_id from me)
  order by s.full_name
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

grant execute on function
  public.payment_settings_get(),
  public.payment_settings_save(integer, text, text, text, text, text, text, integer),
  public.invoice_ensure_month(integer, integer),
  public.invoice_mark_overdue(),
  public.wali_payment_gate(),
  public.payment_initiate(jsonb, text),
  public.payment_submit_proof(uuid, text, text),
  public.payment_cancel_transaction(uuid),
  public.payment_mark_paid_auto(text, text, text),
  public.payment_expire_auto(text),
  public.payment_admin_confirm(uuid, text, text),
  public.payment_wali_invoices(integer, integer),
  public.payment_wali_transactions(),
  public.payment_wali_status(integer, integer),
  public.payment_admin_list(text, text),
  public.payment_admin_detail(uuid),
  public.payment_wali_detail(uuid),
  public.payment_admin_summary(),
  public.feedback_submit(text, text, text, text, uuid, boolean, text, text), -- fixed arg order
  public.feedback_recipient_list(),
  public.feedback_dev_list(),
  public.feedback_set_status(uuid, text, text),
  public.feedback_forward(uuid, text, uuid),
  public.feedback_teacher_options(),
  public.notification_list(integer),
  public.notification_unread_count(),
  public.notification_mark_read(uuid),
  public.notification_mark_all_read(),
  public.v10_admin_dashboard(),
  public.v10_wali_dashboard(),
  public.v10_dev_dashboard(),
  public.v10_teacher_whatsapp_directory()
to authenticated;

-- ============================================================================
-- RLS (rule #34/#35/#45/#85)
-- ============================================================================

alter table public.payment_settings     enable row level security;
alter table public.payment_invoices     enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_allocations  enable row level security;
alter table public.payment_webhooks     enable row level security;
alter table public.feedback             enable row level security;
alter table public.notifications        enable row level security;

-- payment_settings: tenant members read; ADMIN write (RPC re-checks anyway).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists payment_settings_select on public.payment_settings;
drop policy if exists payment_settings_write on public.payment_settings;
create policy payment_settings_select on public.payment_settings
  for select to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

create policy payment_settings_write on public.payment_settings
  for all to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()
                      and role = 'ADMIN'))
  with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid()
                      and role = 'ADMIN'));

-- payment_invoices: tenant members read; wali reads own children (subset OK);
-- writes only via RPC (no direct insert/update policies).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists payment_invoices_select on public.payment_invoices;
drop policy if exists payment_invoices_wali_select on public.payment_invoices;
create policy payment_invoices_select on public.payment_invoices
  for select to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

create policy payment_invoices_wali_select on public.payment_invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      join public.guardians g on g.profile_id = p.id
      join public.guardian_students gs on gs.guardian_id = g.id
      where p.id = auth.uid() and gs.student_id = payment_invoices.student_id
    )
  );

-- payment_transactions: payer reads own; tenant members (staff) read.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists payment_transactions_payer_select on public.payment_transactions;
drop policy if exists payment_transactions_staff_select on public.payment_transactions;
drop policy if exists payment_transactions_payer_update on public.payment_transactions;
create policy payment_transactions_payer_select on public.payment_transactions
  for select to authenticated
  using (payer_profile_id = auth.uid());

create policy payment_transactions_staff_select on public.payment_transactions
  for select to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

create policy payment_transactions_payer_update on public.payment_transactions
  for update to authenticated
  using (payer_profile_id = auth.uid() and status = 'PENDING')
  with check (payer_profile_id = auth.uid());

-- payment_allocations readable via transaction/invoice owners.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists payment_allocations_select on public.payment_allocations;
create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.payment_transactions t
               where t.id = payment_allocations.transaction_id and t.payer_profile_id = auth.uid())
  );

-- payment_webhooks: server-only (service role). No client policies at all.
-- (RLS enabled with no policy = denied for authenticated — correct.)

-- feedback: visibility enforced by feedback_recipient_list for reads; users
-- may read rows they sent or that are addressed tenant-wide per role:
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists feedback_select on public.feedback;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated
  using (
    sender_profile_id = auth.uid()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (
            (p.role = 'DEVELOPER' and feedback.target_type = 'DEVELOPER')
            or (p.role = 'ADMIN' and p.tenant_id = feedback.tenant_id and feedback.target_type <> 'DEVELOPER')
            or (p.role = 'KOORDINATOR' and p.tenant_id = feedback.tenant_id
                and feedback.target_type in ('KOORDINATOR','USTADZ'))
            or (p.role = 'USTADZ' and feedback.target_type = 'USTADZ' and exists (
                 select 1 from public.teachers t
                 where t.id = feedback.target_teacher_id
                   and t.tenant_id = p.tenant_id
                   and lower(btrim(t.full_name)) = lower(btrim(p.full_name))))
          )
      )
    )
  );

create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (sender_profile_id = auth.uid());

-- status/response changes only via RPC → no update policy for clients.

-- notifications: only own rows.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_insert on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_insert on public.notifications
  for insert to authenticated with check (user_id = auth.uid());
