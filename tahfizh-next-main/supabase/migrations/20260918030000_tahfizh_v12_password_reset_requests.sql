-- ============================================================================
-- TAHFIZH V12.12 — PEMULIHAN AKUN TANPA EMAIL (password_reset_requests)
-- ============================================================================
--  MASALAH
--    Akun Santri/Guru dibuat dengan email sintetis ({username}@santri.tahfizh.local)
--    yang tidak pernah menerima email, sehingga alur "Lupa Password" via email
--    mustahil untuk akun tersebut. Satu-satunya jalan sebelumnya: reset manual
--    oleh Admin tanpa bukti permintaan.
--
--  SOLUSI — permintaan reset terkontrol (tanpa email):
--    1. Pengguna (santri/guru) mengajukan lewat halaman Lupa Password dengan
--       USERNAME (RPC password_reset_request, anon).
--    2. Admin lembaga melihat permintaan di Pengaturan → Keamanan
--       (RPC admin_password_reset_requests) lalu MENYETUJUI → sistem
--       menghasilkan KODE sekali-pakai (8 karakter, berlaku 30 menit) yang
--       Admin kirimkan ke pemohon via WhatsApp.
--    3. Pemohon menukarkan kode + password baru di halaman yang sama
--       (RPC password_reset_code_check memvalidasi lalu memakai kode;
--       server action menetapkan password via Supabase Auth service-role —
--       plaintext password TIDAK pernah menyentuh SQL).
--
--  Keamanan:
--    - Semua RPC SECURITY DEFINER dengan pemeriksaan tenant/role eksplisit.
--    - Kode disimpan sebagai hash SHA-256 (pgcrypto), plaintext hanya
--      ditampilkan SEKALI ke Admin saat menyetujui.
--    - Kode kedaluwarsa 30 menit, sekali pakai, dan request lama otomatis
--      dipensiunkan saat Admin menyetujui permintaan baru.
--    - Anti-spam: maksimal 3 permintaan per akun per 24 jam; RLS tabel
--      menutup insert/select/update langsung dari client (baca sendiri saja).
--
--  Idempoten: DO-blok enum, add column if not exists, drop+create ulang RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum status permintaan + tabel
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.password_reset_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.password_reset_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  status          public.password_reset_status not null default 'PENDING',
  code_hash       text,
  code_expires_at timestamptz,
  code_used_at    timestamptz,
  note            text,
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null
);

create index if not exists password_reset_requests_tenant_idx
  on public.password_reset_requests (tenant_id, status, requested_at desc);
create index if not exists password_reset_requests_profile_idx
  on public.password_reset_requests (profile_id, status);
-- Satu permintaan PENDING per akun — mencegah duplikasi & spam.
create unique index if not exists password_reset_requests_one_pending
  on public.password_reset_requests (profile_id)
  where status = 'PENDING';

alter table public.password_reset_requests enable row level security;

drop policy if exists password_reset_requests_select_own on public.password_reset_requests;
create policy password_reset_requests_select_own on public.password_reset_requests
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists password_reset_requests_select_admin on public.password_reset_requests;
create policy password_reset_requests_select_admin on public.password_reset_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles a
      where a.id = auth.uid()
        and a.role = 'ADMIN'
        and a.tenant_id = password_reset_requests.tenant_id
    )
  );

drop policy if exists password_reset_requests_update_admin on public.password_reset_requests;
create policy password_reset_requests_update_admin on public.password_reset_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles a
      where a.id = auth.uid()
        and a.role = 'ADMIN'
        and a.tenant_id = password_reset_requests.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. RPC: ajukan permintaan reset via username (anon, tanpa bocor keberadaan)
-- ---------------------------------------------------------------------------
drop function if exists public.password_reset_request(text);

create or replace function public.password_reset_request(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   public.profiles;
  v_pending   int;
begin
  if p_username is null or btrim(p_username) = '' then
    return 'Masukkan username akun Anda.';
  end if;

  select * into v_profile
  from public.profiles
  where username is not null
    and lower(btrim(username)) = lower(btrim(p_username))
  limit 1;

  -- Selalu balas generik: jangan bocorkan apakah username terdaftar.
  if v_profile is null or v_profile.tenant_id is null then
    return 'Jika username terdaftar, permintaan reset telah dikirim ke Admin lembaga. Admin akan menghubungi Anda dengan kode reset.';
  end if;

  -- Sudah ada yang PENDING? Cukup info ulang.
  select count(*) into v_pending
  from public.password_reset_requests
  where profile_id = v_profile.id and status = 'PENDING';
  if v_pending > 0 then
    return 'Permintaan reset Anda sudah terkirim dan sedang menunggu persetujuan Admin lembaga.';
  end if;

  -- Anti-spam: maksimal 3 permintaan per 24 jam.
  select count(*) into v_pending
  from public.password_reset_requests
  where profile_id = v_profile.id
    and requested_at > now() - interval '24 hours';
  if v_pending >= 3 then
    return 'Permintaan reset telah dikirim ke Admin lembaga. Admin akan menghubungi Anda dengan kode reset.';
  end if;

  insert into public.password_reset_requests (tenant_id, profile_id)
  values (v_profile.tenant_id, v_profile.id);

  return 'Jika username terdaftar, permintaan reset telah dikirim ke Admin lembaga. Admin akan menghubungi Anda dengan kode reset.';
end;
$$;

grant execute on function public.password_reset_request(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: validasi & pakai kode (anon) — mengembalikan profile_id bila sah
-- ---------------------------------------------------------------------------
drop function if exists public.password_reset_code_check(text, text);

create or replace function public.password_reset_code_check(p_username text, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_request    public.password_reset_requests;
begin
  if p_username is null or btrim(p_username) = '' or p_code is null or btrim(p_code) = '' then
    raise exception 'KODE_TIDAK_VALID';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.username is not null
    and lower(btrim(p.username)) = lower(btrim(p_username))
  limit 1;
  if v_profile_id is null then
    raise exception 'KODE_TIDAK_VALID';
  end if;

  select r.* into v_request
  from public.password_reset_requests r
  where r.profile_id = v_profile_id
    and r.status = 'APPROVED'
    and r.code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
    and r.code_expires_at > now()
  order by r.decided_at desc
  limit 1
  for update;
  if v_request is null then
    raise exception 'KODE_TIDAK_VALID';
  end if;

  update public.password_reset_requests
  set status = 'USED', code_used_at = now()
  where id = v_request.id;

  return v_profile_id;
end;
$$;

grant execute on function public.password_reset_code_check(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: daftar permintaan untuk Admin lembaga
-- ---------------------------------------------------------------------------
drop function if exists public.admin_password_reset_requests();

create or replace function public.admin_password_reset_requests()
returns table (
  id           uuid,
  full_name    text,
  role         public.app_role,
  username     text,
  whatsapp     text,
  requested_at timestamptz,
  status       public.password_reset_status
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;

  return query
  select r.id,
         p.full_name,
         p.role,
         p.username,
         p.whatsapp,
         r.requested_at,
         r.status
  from public.password_reset_requests r
  join public.profiles p on p.id = r.profile_id
  where r.tenant_id = v_tenant
  order by (r.status = 'PENDING') desc, r.requested_at desc
  limit 100;
end;
$$;

grant execute on function public.admin_password_reset_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: Admin setujui / tolak permintaan (kode plaintext dikembalikan SEKALI)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_password_reset_decide(uuid, boolean, text);

create or replace function public.admin_password_reset_decide(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_request  public.password_reset_requests;
  v_code     text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_request
  from public.password_reset_requests
  where id = p_request_id and tenant_id = v_tenant
  for update;
  if v_request is null then
    raise exception 'PERMINTAAN_TIDAK_DITEMUKAN';
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'PERMINTAAN_SUDAH_DIPROSES';
  end if;

  if not p_approve then
    update public.password_reset_requests
    set status = 'REJECTED', decided_at = now(), decided_by = v_uid,
        note = coalesce(btrim(p_note), 'Ditolak oleh Admin.')
    where id = v_request.id;
    return null;
  end if;

  -- Pensiunkan kode lama yang masih berlaku milik akun ini (satu kode aktif).
  update public.password_reset_requests
  set status = 'EXPIRED'
  where profile_id = v_request.profile_id and status = 'APPROVED';

  v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  update public.password_reset_requests
  set status = 'APPROVED',
      code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      code_expires_at = now() + interval '30 minutes',
      decided_at = now(),
      decided_by = v_uid,
      note = null
  where id = v_request.id;

  return v_code;
end;
$$;

grant execute on function public.admin_password_reset_decide(uuid, boolean, text) to authenticated;
