-- ============================================================================
-- TAHFIZH V29 — INFAK PENGEMBANGAN: PENGAJUAN TIDAK MAMPU (KERINGANAN)
-- ============================================================================
-- Fitur baru di modul Infak Pengembangan:
--   1. Wali santri dapat mengajukan "tidak mampu" (keringanan infak) untuk
--      anaknya. Syarat: mengunggah Surat Keterangan Tidak Mampu yang
--      TERTANGGAL maksimal 7 hari terakhir (dan tidak bertanggal di masa depan).
--   2. Pengajuan masuk ke DEVELOPER. Developer memilih untuk MENGRATISKAN
--      infak santri tersebut dalam kurun waktu berapa bulan (1-24 bulan).
--   3. Bulan-bulan yang digratiskan otomatis bebas tagihan: tagihan yang sudah
--      ada (belum dibayar) ditandai lunas via WAIVER, dan tagihan bulan
--      berikutnya yang masuk periode keringanan langsung dibuat bebas.
--
-- Aman dijalankan ulang (idempoten). Tidak ada drop tabel / kolom / data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel pengajuan tidak mampu
-- ---------------------------------------------------------------------------
create table if not exists public.payment_waiver_requests (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  guardian_id      uuid references public.guardians (id) on delete set null,
  requested_by     uuid references public.profiles (id) on delete set null,
  certificate_path text not null,                 -- bucket payment-proofs: {tenant}/waiver-….ext
  certificate_date date not null,                 -- tanggal surat (wajib ≤ 7 hari terakhir)
  reason           text,
  status           text not null default 'PENDING'
                   check (status in ('PENDING','APPROVED','REJECTED')),
  waive_months     integer check (waive_months is null or (waive_months between 1 and 24)),
  waive_from_year  integer,
  waive_from_month integer check (waive_from_month is null or (waive_from_month between 1 and 12)),
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists payment_waiver_requests_tenant_idx  on public.payment_waiver_requests (tenant_id);
create index if not exists payment_waiver_requests_student_idx on public.payment_waiver_requests (student_id);
create index if not exists payment_waiver_requests_status_idx  on public.payment_waiver_requests (status);

alter table public.payment_waiver_requests enable row level security;

-- Select: DEVELOPER melihat semua; wali hanya pengajuan miliknya sendiri.
-- Penulisan hanya lewat RPC SECURITY DEFINER (tanpa policy write untuk klien).
drop policy if exists payment_waiver_dev_select on public.payment_waiver_requests;
create policy payment_waiver_dev_select on public.payment_waiver_requests
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'DEVELOPER'));

drop policy if exists payment_waiver_wali_select on public.payment_waiver_requests;
create policy payment_waiver_wali_select on public.payment_waiver_requests
  for select to authenticated
  using (requested_by = auth.uid());

comment on table public.payment_waiver_requests is
  'V29: pengajuan tidak mampu (keringanan infak) dari wali ke Developer, berisi surat keterangan & durasi bebas infak.';

-- ---------------------------------------------------------------------------
-- 2. Helper: apakah infak santri bebas pada bulan tertentu (pengajuan disetujui)
-- ---------------------------------------------------------------------------
create or replace function public.student_waived_at(
  p_student_id uuid,
  p_year       integer,
  p_month      integer
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.payment_waiver_requests r
    where r.student_id = p_student_id
      and r.status = 'APPROVED'
      and r.waive_months is not null
      and (p_year * 12 + p_month) between
            (r.waive_from_year * 12 + r.waive_from_month)
            and (r.waive_from_year * 12 + r.waive_from_month + r.waive_months - 1)
  )
$$;

revoke all on function public.student_waived_at(uuid, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. invoice_generate_all — bulan dalam periode keringanan langsung bebas.
--    (Versi V26 + kesadaran keringanan; idempoten.)
-- ---------------------------------------------------------------------------
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
    insert into public.payment_invoices
      (tenant_id, student_id, academic_year, year, month, amount, status, paid_via, paid_at)
    select s.tenant_id, s.id,
           case when p_month >= 7 then p_year::text || '/' || (p_year + 1)::text
                else (p_year - 1)::text || '/' || p_year::text end,
           p_year, p_month, v_amount,
           case when w.waived then 'PAID'    else 'UNPAID' end,
           case when w.waived then 'WAIVER'  else null     end,
           case when w.waived then now()     else null     end
    from public.students s
    join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
    cross join lateral (select public.student_waived_at(s.id, p_year, p_month) as waived) w
    where s.status = 'ACTIVE'
      and make_date(p_year, p_month, 1) >= public.tenant_billing_start_month(t.created_at)
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

-- ---------------------------------------------------------------------------
-- 4. invoice_ensure_for_guardian — sama: bulan keringanan langsung bebas.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_ensure_for_guardian(p_guardian_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today record;
  v_amount integer;
begin
  select * into v_today from public.jakarta_today();
  select default_amount into v_amount from public.platform_payment_settings where id;
  v_amount := greatest(coalesce(v_amount, 1000), 1000);

  insert into public.payment_invoices
    (tenant_id, student_id, academic_year, year, month, amount, status, paid_via, paid_at)
  select s.tenant_id, s.id,
         case when v_today.m >= 7 then v_today.y::text || '/' || (v_today.y + 1)::text
              else (v_today.y - 1)::text || '/' || v_today.y::text end,
         v_today.y, v_today.m, v_amount,
         case when w.waived then 'PAID'   else 'UNPAID' end,
         case when w.waived then 'WAIVER' else null     end,
         case when w.waived then now()    else null     end
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
  cross join lateral (select public.student_waived_at(s.id, v_today.y, v_today.m) as waived) w
  where gs.guardian_id = p_guardian_id
    and make_date(v_today.y, v_today.m, 1) >= public.tenant_billing_start_month(t.created_at)
    and not exists (
      select 1 from public.payment_invoices i
      where i.student_id = s.id and i.year = v_today.y and i.month = v_today.m
    )
  on conflict (tenant_id, student_id, academic_year, year, month) do nothing;
end;
$$;

revoke all on function public.invoice_generate_all(integer, integer) from public, anon, authenticated;
revoke all on function public.invoice_ensure_for_guardian(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC — WALI mengajukan tidak mampu (surat keterangan ≤ 7 hari terakhir)
-- ---------------------------------------------------------------------------
create or replace function public.waiver_submit_request(
  p_student_id       uuid,
  p_certificate_path text,
  p_certificate_date date,
  p_reason           text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile  public.profiles;
  v_guardian public.guardians;
  v_student  public.students;
  v_today    date;
  v_id       uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is null then raise exception 'AKSES_DITOLAK'; end if;

  select s.* into v_student
  from public.students s
  join public.guardian_students gs on gs.student_id = s.id and gs.guardian_id = v_guardian.id
  where s.id = p_student_id;
  if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

  if btrim(coalesce(p_certificate_path, '')) = '' then raise exception 'SURAT_WAJIB'; end if;
  if p_certificate_date is null then raise exception 'TANGGAL_SURAT_WAJIB'; end if;

  v_today := (public.jakarta_now())::date;
  if p_certificate_date > v_today then raise exception 'TANGGAL_SURAT_MASA_DEPAN'; end if;
  if (v_today - p_certificate_date) > 7 then raise exception 'SURAT_KEDALUWARSA'; end if;

  if exists (
    select 1 from public.payment_waiver_requests r
    where r.student_id = p_student_id and r.status = 'PENDING'
  ) then
    raise exception 'SUDAH_DIAJUKAN';
  end if;

  insert into public.payment_waiver_requests
    (tenant_id, student_id, guardian_id, requested_by, certificate_path, certificate_date, reason)
  values (v_student.tenant_id, p_student_id, v_guardian.id, v_profile.id,
          btrim(p_certificate_path), p_certificate_date,
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  -- Beri tahu seluruh Developer.
  insert into public.notifications (user_id, tenant_id, type, title, body, link)
  select p.id, null, 'INFO',
         'Pengajuan tidak mampu baru',
         v_profile.full_name || ' mengajukan keringanan infak untuk ' || v_student.full_name || '.',
         '/developer/infak/pengajuan'
  from public.profiles p
  where p.role = 'DEVELOPER';

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC — daftar pengajuan wali & daftar pengajuan Developer
-- ---------------------------------------------------------------------------
create or replace function public.waiver_wali_list()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'studentId', s.id, 'studentName', s.full_name, 'studentCode', s.business_code,
      'certificateDate', r.certificate_date,
      'reason', r.reason,
      'status', r.status,
      'months', r.waive_months,
      'fromYear', r.waive_from_year, 'fromMonth', r.waive_from_month,
      'decidedAt', r.decided_at,
      'rejectReason', r.reject_reason,
      'createdAt', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.payment_waiver_requests r
    join public.students s on s.id = r.student_id
    where r.requested_by = v_profile.id
  );
end;
$$;

create or replace function public.waiver_dev_list(
  p_status text default 'PENDING',
  p_query  text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'studentId', s.id, 'studentName', s.full_name, 'studentCode', s.business_code,
      'tenantName', t.name, 'tenantCode', t.business_code,
      'guardianName', gp.full_name,
      'requestedByName', p.full_name,
      'certificatePath', r.certificate_path,
      'certificateDate', r.certificate_date,
      'reason', r.reason,
      'status', r.status,
      'months', r.waive_months,
      'fromYear', r.waive_from_year, 'fromMonth', r.waive_from_month,
      'decidedAt', r.decided_at,
      'rejectReason', r.reject_reason,
      'createdAt', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.payment_waiver_requests r
    join public.students s on s.id = r.student_id
    join public.tenants t on t.id = r.tenant_id
    left join public.guardians g on g.id = r.guardian_id
    left join public.profiles gp on gp.id = g.profile_id
    left join public.profiles p on p.id = r.requested_by
    where (coalesce(p_status, 'ALL') = 'ALL' or r.status = p_status)
      and (
        p_query is null
        or s.full_name ilike '%' || p_query || '%'
        or s.business_code ilike '%' || p_query || '%'
        or t.name ilike '%' || p_query || '%'
        or t.business_code ilike '%' || p_query || '%'
      )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC — DEVELOPER menyetujui (gratis N bulan) atau menolak pengajuan
-- ---------------------------------------------------------------------------
create or replace function public.waiver_dev_decide(
  p_request_id uuid,
  p_decision   text,          -- APPROVE | REJECT
  p_months     integer default null,
  p_reason     text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_req     public.payment_waiver_requests;
  v_today   record;
  v_from    integer;
  v_until   integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_req from public.payment_waiver_requests where id = p_request_id for update;
  if v_req is null then raise exception 'PENGAJUAN_TIDAK_DITEMUKAN'; end if;
  if v_req.status <> 'PENDING' then raise exception 'STATUS_TIDAK_DAPAT_DIUBAH'; end if;

  select * into v_today from public.jakarta_today();

  if p_decision = 'APPROVE' then
    if p_months is null or p_months < 1 or p_months > 24 then raise exception 'DURASI_TIDAK_VALID'; end if;
    v_from  := v_today.y * 12 + v_today.m;
    v_until := v_from + p_months - 1;

    update public.payment_waiver_requests
    set status = 'APPROVED',
        waive_months = p_months,
        waive_from_year = v_today.y,
        waive_from_month = v_today.m,
        decided_by = auth.uid(), decided_at = now(), reject_reason = null, updated_at = now()
    where id = p_request_id;

    -- Bebaskan tagihan bulan berjalan & bulan berikutnya yang sudah terbit.
    update public.payment_invoices i
    set status = 'PAID', paid_via = 'WAIVER', paid_at = coalesce(i.paid_at, now()), updated_at = now()
    where i.student_id = v_req.student_id
      and i.status in ('UNPAID', 'PENDING')
      and (i.year * 12 + i.month) between v_from and v_until;

    if v_req.requested_by is not null then
      insert into public.notifications (user_id, tenant_id, type, title, body, link)
      values (v_req.requested_by, v_req.tenant_id, 'INFO',
              'Pengajuan tidak mampu disetujui',
              'Alhamdulillah, infak pengembangan digratiskan selama ' || p_months || ' bulan.',
              '/santri/infak');
    end if;
  elsif p_decision = 'REJECT' then
    update public.payment_waiver_requests
    set status = 'REJECTED',
        reject_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Pengajuan tidak dapat disetujui.'),
        decided_by = auth.uid(), decided_at = now(), updated_at = now()
    where id = p_request_id;

    if v_req.requested_by is not null then
      insert into public.notifications (user_id, tenant_id, type, title, body, link)
      values (v_req.requested_by, v_req.tenant_id, 'INFO',
              'Pengajuan tidak mampu belum disetujui',
              coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Pengajuan tidak dapat disetujui.'),
              '/santri/infak');
    end if;
  else
    raise exception 'KEPUTUSAN_TIDAK_VALID';
  end if;
end;
$$;

grant execute on function
  public.waiver_submit_request(uuid, text, date, text),
  public.waiver_wali_list(),
  public.waiver_dev_list(text, text),
  public.waiver_dev_decide(uuid, text, integer, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Storage — wali dapat membaca surat keterangan miliknya sendiri.
--    (Upload memakai policy "payment proofs insert member" yang sudah ada;
--     Developer membaca semua lewat policy "payment proofs read developer".)
-- ---------------------------------------------------------------------------
drop policy if exists "payment proofs read own waiver" on storage.objects;
create policy "payment proofs read own waiver"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.payment_waiver_requests r
      where r.certificate_path = name and r.requested_by = auth.uid()
    )
  );
