-- ============================================================================
-- TAHFIZH V12 — INFAK PENGEMBANGAN = LEVEL PLATFORM (DASBOR DEVELOPER)
-- ============================================================================
-- Perubahan aturan:
--   1. Menu & pengaturan Infak Pengembangan ada di dasbor DEVELOPER, bukan
--      dasbor Admin lembaga. Nominal minimal Rp1.000, rekening/QRIS, dan
--      instruksi pembayaran diatur SATU KALI untuk seluruh platform
--      (tabel platform_payment_settings, satu baris).
--   2. Tagihan dibuat untuk SEMUA santri aktif dari SEMUA lembaga aktif,
--      setiap bulan. Muncul tanggal 1 (Asia/Jakarta), jatuh tempo maksimal
--      tanggal 15, pembatasan akses wali mulai tanggal 16 (gate lama tetap).
--        - pg_cron harian 00:05 WIB memanggil invoice_generate_all()
--          (idempoten — juga menyusul santri yang baru ditambahkan);
--        - fallback: saat wali membuka aplikasi, tagihan bulan berjalan anak-
--          anaknya dibuat bila belum ada (invoice_ensure_for_guardian);
--        - tombol manual Developer: invoice_ensure_month().
--   3. Konfirmasi pembayaran manual dilakukan DEVELOPER (semua lembaga),
--      bukan Admin lembaga. RPC payment_admin_* diganti payment_dev_*.
--   4. Admin/Koordinator/Guru lembaga tidak lagi membaca data infak
--      (RLS tenant-wide dicabut; wali tetap membaca tagihan anaknya sendiri).
-- Aman dijalankan ulang (idempoten). Tidak ada drop tabel / kolom / data.
-- Tabel lama payment_settings (per lembaga) dibiarkan apa adanya (tidak dipakai).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pengaturan infak level platform (satu baris)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_payment_settings (
  id                    boolean primary key default true check (id),
  default_amount        integer not null default 1000 check (default_amount >= 1000),
  bank_name             text,
  bank_account_no       text,
  bank_account_name     text,
  qris_path             text,                       -- path di bucket payment-proofs: platform/qris.ext
  instructions          text,
  confirm_note          text,
  confirm_deadline_days integer not null default 3 check (confirm_deadline_days between 1 and 14),
  updated_by            uuid references public.profiles (id) on delete set null,
  updated_at            timestamptz not null default now()
);

insert into public.platform_payment_settings (id) values (true)
on conflict (id) do nothing;

alter table public.platform_payment_settings enable row level security;
-- Tanpa policy klien: seluruh akses lewat RPC SECURITY DEFINER di bawah.

comment on table public.platform_payment_settings is
  'V12: pengaturan Infak Pengembangan level platform (satu baris), dikelola Developer.';

-- ---------------------------------------------------------------------------
-- 2. RPC pengaturan — baca (semua user login) / simpan (DEVELOPER)
-- ---------------------------------------------------------------------------
create or replace function public.payment_settings_get()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.platform_payment_settings;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_row from public.platform_payment_settings where id;
  return jsonb_build_object(
    'default_amount',        coalesce(v_row.default_amount, 1000),
    'bank_name',             v_row.bank_name,
    'bank_account_no',       v_row.bank_account_no,
    'bank_account_name',     v_row.bank_account_name,
    'qris_path',             v_row.qris_path,
    'instructions',          v_row.instructions,
    'confirm_note',          v_row.confirm_note,
    'confirm_deadline_days', coalesce(v_row.confirm_deadline_days, 3)
  );
end;
$$;

-- Parameter null = biarkan nilai lama; string kosong = kosongkan field.
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
  if v_profile is null or v_profile.role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_default_amount is not null and p_default_amount < 1000 then
    raise exception 'NOMINAL_MINIMAL';
  end if;

  insert into public.platform_payment_settings (id) values (true) on conflict (id) do nothing;

  update public.platform_payment_settings set
    default_amount        = coalesce(p_default_amount, default_amount),
    bank_name             = case when p_bank_name    is null then bank_name         else nullif(btrim(p_bank_name), '')    end,
    bank_account_no       = case when p_bank_no      is null then bank_account_no   else nullif(btrim(p_bank_no), '')      end,
    bank_account_name     = case when p_bank_account is null then bank_account_name else nullif(btrim(p_bank_account), '') end,
    qris_path             = coalesce(nullif(btrim(coalesce(p_qris_path, '')), ''), qris_path),
    instructions          = case when p_instructions is null then instructions      else nullif(btrim(p_instructions), '') end,
    confirm_note          = case when p_confirm_note is null then confirm_note      else nullif(btrim(p_confirm_note), '') end,
    confirm_deadline_days = coalesce(p_deadline_days, confirm_deadline_days),
    updated_by            = auth.uid(),
    updated_at            = now()
  where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pembuatan tagihan — SEMUA santri aktif di SEMUA lembaga aktif
-- ---------------------------------------------------------------------------

-- Internal (cron / fallback). Idempoten: tidak membuat ganda untuk santri +
-- bulan yang sama walau label tahun ajarannya berbeda.
create or replace function public.invoice_generate_all(
  p_year  integer default null,
  p_month integer default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today record;
  v_amount integer;
  v_count integer := 0;
begin
  select * into v_today from public.jakarta_today();
  p_year  := coalesce(p_year, v_today.y);
  p_month := coalesce(p_month, v_today.m);

  select default_amount into v_amount from public.platform_payment_settings where id;
  v_amount := greatest(coalesce(v_amount, 1000), 1000);

  with ins as (
    insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
    select s.tenant_id, s.id,
           case when p_month >= 7 then p_year::text || '/' || (p_year + 1)::text
                else (p_year - 1)::text || '/' || p_year::text end,
           p_year, p_month, v_amount
    from public.students s
    join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
    where s.status = 'ACTIVE'
      and not exists (
        select 1 from public.payment_invoices i
        where i.student_id = s.id and i.year = p_year and i.month = p_month
      )
    on conflict (tenant_id, student_id, academic_year, year, month) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

-- Fallback: pastikan anak-anak seorang wali punya tagihan bulan berjalan.
create or replace function public.invoice_ensure_for_guardian(p_guardian_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today record;
  v_amount integer;
begin
  select * into v_today from public.jakarta_today();
  select default_amount into v_amount from public.platform_payment_settings where id;
  v_amount := greatest(coalesce(v_amount, 1000), 1000);

  insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
  select s.tenant_id, s.id,
         case when v_today.m >= 7 then v_today.y::text || '/' || (v_today.y + 1)::text
              else (v_today.y - 1)::text || '/' || v_today.y::text end,
         v_today.y, v_today.m, v_amount
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
  where gs.guardian_id = p_guardian_id
    and not exists (
      select 1 from public.payment_invoices i
      where i.student_id = s.id and i.year = v_today.y and i.month = v_today.m
    )
  on conflict (tenant_id, student_id, academic_year, year, month) do nothing;
end;
$$;

revoke all on function public.invoice_generate_all(integer, integer) from public, anon, authenticated;
revoke all on function public.invoice_ensure_for_guardian(uuid) from public, anon, authenticated;

-- Tombol manual Developer ("Buat Tagihan Bulan Ini") — semua lembaga.
create or replace function public.invoice_ensure_month(
  p_year  integer default null,
  p_month integer default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;
  return public.invoice_generate_all(p_year, p_month);
end;
$$;

-- Jadwal otomatis: setiap hari 00:05 WIB (= 17:05 UTC). Hari ke-1 membuat
-- tagihan bulan baru; hari lain hanya menyusul santri yang baru ditambahkan.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'tahfizh-invoice-monthly';
    perform cron.schedule('tahfizh-invoice-monthly', '5 17 * * *', 'select public.invoice_generate_all()');
  else
    raise notice 'pg_cron tidak tersedia — tagihan tetap dibuat saat wali membuka aplikasi atau lewat tombol Developer.';
  end if;
exception when others then
  raise notice 'Jadwal pg_cron dilewati (%) — aktifkan pg_cron di Database → Extensions bila ingin jadwal otomatis. Fallback tetap berjalan.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Gate wali & daftar tagihan — memakai pengaturan platform
-- ---------------------------------------------------------------------------
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

  -- Tagihan muncul tanggal 1: pastikan sudah ada untuk anak-anak wali ini.
  perform public.invoice_ensure_for_guardian(v_guardian.id);

  select coalesce(default_amount, 1000) into v_min from public.platform_payment_settings where id;

  select count(*) into v_unpaid
  from public.payment_invoices i
  join public.guardian_students gs on gs.student_id = i.student_id
  where gs.guardian_id = v_guardian.id
    and i.year = v_today.y and i.month = v_today.m
    and i.status <> 'PAID';

  return jsonb_build_object(
    'locked',        v_today.d >= 16 and v_unpaid > 0,   -- jatuh tempo 15, lock mulai 16
    'applicable',    true,
    'day',           v_today.d,
    'unpaid_count',  v_unpaid,
    'min_amount',    coalesce(v_min, 1000),
    'month',         v_today.m,
    'year',          v_today.y,
    'month_label',   to_char(make_date(v_today.y, v_today.m, 1), 'TMMonth YYYY'),
    'academic_year', v_today.ay
  );
end;
$$;

create or replace function public.payment_wali_invoices(p_year integer default null, p_month integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
  v_settings public.platform_payment_settings;
  v_children jsonb;
  v_others jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  p_year := coalesce(p_year, v_today.y); p_month := coalesce(p_month, v_today.m);
  select * into v_settings from public.platform_payment_settings where id;

  select * into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is not null then
    perform public.invoice_ensure_for_guardian(v_guardian.id);
  end if;

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

  -- Santri lain di lembaga yang belum lunas bulan berjalan (hanya nama + ID).
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

-- ---------------------------------------------------------------------------
-- 5. Bukti transfer → notifikasi ke DEVELOPER (bukan Admin lembaga)
-- ---------------------------------------------------------------------------
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
-- 6. Konfirmasi / daftar / detail / ringkasan — DEVELOPER, semua lembaga
-- ---------------------------------------------------------------------------
drop function if exists public.payment_admin_confirm(uuid, text, text);
drop function if exists public.payment_admin_list(text, text);
drop function if exists public.payment_admin_detail(uuid);
drop function if exists public.payment_admin_summary();
drop function if exists public.v10_admin_dashboard();

create or replace function public.payment_dev_confirm(
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
  if v_profile is null or v_profile.role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_tx from public.payment_transactions
    where id = p_transaction_id for update;
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
            'Pembayaran infak Anda telah dikonfirmasi. Jazakumullahu khairan.',
            '/santri/infak');
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
            '/santri/infak');
  else
    raise exception 'KEPUTUSAN_TIDAK_VALID';
  end if;
end;
$$;

create or replace function public.payment_dev_list(
  p_status text default 'ALL',
  p_query  text default null
)
returns table (
  id uuid, reference text, payer_name text, method text, status text,
  total_amount integer, proof_path text, has_proof boolean,
  student_summary text, tenant_name text, tenant_code text,
  created_at timestamptz, confirmed_at timestamptz
) language sql security definer set search_path = public as $$
  select t.id, t.reference, t.payer_name, t.method, t.status, t.total_amount,
         t.proof_path, (t.proof_path is not null) as has_proof,
         (
           select string_agg(distinct s.full_name, ', ')
           from public.payment_allocations a
           join public.payment_invoices i on i.id = a.invoice_id
           join public.students s on s.id = i.student_id
           where a.transaction_id = t.id
         ) as student_summary,
         tn.name as tenant_name, tn.business_code as tenant_code,
         t.created_at, t.confirmed_at
  from public.payment_transactions t
  join public.tenants tn on tn.id = t.tenant_id
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'DEVELOPER')
    and (p_status = 'ALL' or t.status = p_status)
    and (p_query is null or t.payer_name ilike '%' || p_query || '%'
         or t.reference ilike '%' || p_query || '%'
         or tn.name ilike '%' || p_query || '%'
         or tn.business_code ilike '%' || p_query || '%')
  order by t.created_at desc
  limit 300
$$;

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

-- Ringkasan platform: tagihan bulan berjalan + total terkumpul (semua lembaga).
create or replace function public.payment_dev_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();

  return jsonb_build_object(
    'monthLabel', to_char(make_date(v_today.y, v_today.m, 1), 'TMMonth YYYY'),
    'day', v_today.d,
    'totalInvoices', (select count(*) from public.payment_invoices i where i.year = v_today.y and i.month = v_today.m),
    'paidCount',     (select count(*) from public.payment_invoices i where i.year = v_today.y and i.month = v_today.m and i.status = 'PAID'),
    'unpaidCount',   (select count(*) from public.payment_invoices i where i.year = v_today.y and i.month = v_today.m and i.status = 'UNPAID'),
    'waitingCount',  (select count(*) from public.payment_invoices i where i.year = v_today.y and i.month = v_today.m and i.status in ('PENDING','WAITING_CONFIRM')),
    'collectedTotal', coalesce((select sum(t.total_amount) from public.payment_transactions t where t.status = 'PAID'), 0),
    'manualTotal',    coalesce((select sum(t.total_amount) from public.payment_transactions t where t.status = 'PAID' and t.method = 'MANUAL'), 0),
    'autoTotal',      coalesce((select sum(t.total_amount) from public.payment_transactions t where t.status = 'PAID' and t.method = 'IPAYMU'), 0),
    'pendingConfirm', (select count(*) from public.payment_transactions t where t.status = 'WAITING_CONFIRM'),
    'tenantCount',    (select count(*) from public.tenants t where t.status = 'ACTIVE')
  );
end;
$$;

-- Rincian per lembaga untuk bulan berjalan.
create or replace function public.payment_dev_tenants()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_today record;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();

  return (
    select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', t.id, 'code', t.business_code, 'name', t.name,
        'total',   count(i.id),
        'paid',    count(i.id) filter (where i.status = 'PAID'),
        'unpaid',  count(i.id) filter (where i.status = 'UNPAID'),
        'waiting', count(i.id) filter (where i.status in ('PENDING','WAITING_CONFIRM'))
      ) as r
      from public.tenants t
      left join public.payment_invoices i
        on i.tenant_id = t.id and i.year = v_today.y and i.month = v_today.m
      where t.status = 'ACTIVE'
      group by t.id, t.business_code, t.name
    ) q
  );
end;
$$;

grant execute on function
  public.payment_settings_get(),
  public.payment_settings_save(integer, text, text, text, text, text, text, integer),
  public.invoice_ensure_month(integer, integer),
  public.wali_payment_gate(),
  public.payment_wali_invoices(integer, integer),
  public.payment_submit_proof(uuid, text, text),
  public.payment_dev_confirm(uuid, text, text),
  public.payment_dev_list(text, text),
  public.payment_dev_detail(uuid),
  public.payment_dev_summary(),
  public.payment_dev_tenants()
to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS — data infak hanya untuk Developer + wali (tagihan/transaksi sendiri)
-- ---------------------------------------------------------------------------
drop policy if exists payment_invoices_select on public.payment_invoices;
drop policy if exists payment_invoices_dev_select on public.payment_invoices;
create policy payment_invoices_dev_select on public.payment_invoices
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'DEVELOPER'));

drop policy if exists payment_transactions_staff_select on public.payment_transactions;
drop policy if exists payment_transactions_dev_select on public.payment_transactions;
create policy payment_transactions_dev_select on public.payment_transactions
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'DEVELOPER'));

drop policy if exists payment_allocations_select on public.payment_allocations;
create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'DEVELOPER')
    or exists (select 1 from public.payment_transactions t
               where t.id = payment_allocations.transaction_id and t.payer_profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 8. Storage payment-proofs — Developer membaca semua bukti & mengelola QRIS
--    platform (folder platform/); pembayar membaca bukti miliknya sendiri.
--    Upload bukti wali tetap ke folder lembaganya ({tenant_id}/proof-…).
-- ---------------------------------------------------------------------------
drop policy if exists "payment proofs read tenant" on storage.objects;
drop policy if exists "payment proofs read developer" on storage.objects;
drop policy if exists "payment proofs read platform" on storage.objects;
drop policy if exists "payment proofs read own" on storage.objects;
drop policy if exists "payment proofs write platform developer" on storage.objects;
drop policy if exists "payment proofs update platform developer" on storage.objects;
drop policy if exists "payment proofs delete platform developer" on storage.objects;

create policy "payment proofs read developer"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER'
  );

create policy "payment proofs read platform"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'platform'
  );

create policy "payment proofs read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payment_transactions t
      where t.payer_profile_id = auth.uid() and t.proof_path = name
    )
  );

create policy "payment proofs write platform developer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'platform'
    and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER'
  );

create policy "payment proofs update platform developer"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'platform'
    and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER'
  );

create policy "payment proofs delete platform developer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'platform'
    and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER'
  );
