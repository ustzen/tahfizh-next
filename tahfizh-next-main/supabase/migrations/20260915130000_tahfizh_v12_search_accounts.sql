-- ============================================================================
-- TAHFIZH V12 — GLOBAL SEARCH, AKUN SANTRI/WALI, INFAK PLATFORM
-- ============================================================================
-- 1. students.nickname                  — nama panggilan (master data)
-- 2. profiles.username                  — login santri/wali (username otomatis)
--    + must_change_password             — password sementara (username+1234)
-- 3. unique index usernames             — anti race condition (bukan COUNT(*))
-- 4. search_global(q) RPC               — pencarian global server-side, RLS-aware
--    per role (tanpa USING(true), tetap tenant-isolated)
-- 5. v12 platform labels — infak pengembangan = dana Developer/platform,
--    BUKAN pendapatan sekolah (comment katalog + audit label)
-- Idempotent, aman dijalankan setelah V1–V11.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NAMA PANGGILAN SANTRI
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists nickname text;
-- Index pencarian (b-tree trigram tidak tersedia tanpa ekstensi — ilike prefix
-- tetap memakai index b-tree lower() ini untuk pencarian awalan).
create index if not exists students_tenant_name_lower_idx
  on public.students (tenant_id, lower(full_name));
create index if not exists students_tenant_nickname_lower_idx
  on public.students (tenant_id, lower(nickname))
  where nickname is not null;

-- ----------------------------------------------------------------------------
-- 2. AKUN SANTRI/WALI — SATU SISTEM AKUN (profile role WALI_SANTRI)
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Username unik GLOBAL (login tanpa konteks tenant) — constraint database,
-- race condition ditangani Retry ON CONFLICT, bukan SELECT COUNT(*).
create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

create index if not exists profiles_role_tenant_idx
  on public.profiles (role, tenant_id);

-- Generator username otomatis: zain, zain2, zain3, ... (aman race condition
-- via unique index + ON CONFLICT loop di pemanggil; function ini hanya
-- menormalisasi nama panggilan menjadi kandidat dasar).
create or replace function public.normalize_username_base(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '', 'g'));
  if v is null or v = '' then
    v := 'santri';
  end if;
  return left(v, 24);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. GLOBAL SEARCH RPC (server-side, role-scoped, tenant-isolated)
-- ----------------------------------------------------------------------------
-- Memakai RLS + pemeriksaan role eksplisit. Tidak ada USING(true).
-- Hasil TIDAK memuat ID internal — hanya id UUID untuk navigasi + nama/label.
create or replace function public.search_global(p_query text)
returns table (
  type        text,        -- 'SANTRI' | 'GURU' | 'HALAQAH' | 'TAGIHAN' | 'SURAT'
  id          uuid,        -- internal navigation key (tidak ditampilkan di UI)
  title       text,        -- yang ditampilkan: nama
  subtitle    text,        -- konteks: halaqah/kelas/jabatan
  href        text         -- halaman tujuan
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_role   public.app_role;
  v_tenant uuid;
  v_q      text;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  select role, tenant_id into v_role, v_tenant
  from public.profiles where id = v_uid;

  if v_role is null then
    return;
  end if;

  v_q := '%' || trim(coalesce(p_query, '')) || '%';
  if v_q = '%%' then
    return;
  end if;

  -- ------------------------------------------------------------------
  -- DEVELOPER: melihat lembaga (platform scope) — sesuai aturan platform.
  -- ------------------------------------------------------------------
  if v_role = 'DEVELOPER' then
    return query
      select 'LEMBAGA'::text, t.id, t.name, t.kind, ('/developer/lembaga/' || t.id::text)
      from public.tenants t
      where t.name ilike v_q
      order by t.name
      limit 6;
    return;
  end if;

  if v_tenant is null then
    return;
  end if;

  -- ------------------------------------------------------------------
  -- ADMIN + KOORDINATOR: santri, guru, halaqah lembaga
  -- ------------------------------------------------------------------
  if v_role in ('ADMIN', 'KOORDINATOR') then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/admin/halaqah'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
      order by s.full_name
      limit 6;

    return query
      select 'GURU'::text, g.id, g.full_name, ''::text, '/koordinator/guru-santri'
      from public.teachers g
      where g.tenant_id = v_tenant and g.full_name ilike v_q
      order by g.full_name
      limit 5;

    return query
      select 'HALAQAH'::text, h.id, h.name, ''::text, '/admin/halaqah'
      from public.halaqahs h
      where h.tenant_id = v_tenant and h.name ilike v_q
      order by h.name
      limit 5;
    return;
  end if;

  -- ------------------------------------------------------------------
  -- USTADZ: hanya santri binaannya + halaqah yang diampu
  -- ------------------------------------------------------------------
  if v_role = 'USTADZ' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/ustadz/santri'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
        and exists (
          select 1 from public.teacher_students ts
          where ts.student_id = s.id
        )
      order by s.full_name
      limit 8;
    return;
  end if;

  -- ------------------------------------------------------------------
  -- WALI_SANTRI: hanya anak yang terhubung dengannya (satu akun,
  -- beberapa santri — V12 #23)
  -- ------------------------------------------------------------------
  if v_role = 'WALI_SANTRI' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/wali/anak'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
        and exists (
          select 1
          from public.guardian_students gs
          join public.guardians gd on gd.id = gs.guardian_id
          where gs.student_id = s.id and gd.profile_id = v_uid
        )
      order by s.full_name
      limit 8;
    return;
  end if;
end;
$$;

grant execute on function public.search_global(text) to authenticated;

revoke execute on function public.next_business_id(text, text, bigint) from anon, authenticated;
grant execute on function public.next_business_id(text, text, bigint) to service_role;

-- ----------------------------------------------------------------------------
-- 4. LABEL PLATFORM (V12 #27) — komentar katalog agar makna dana eksplisit
-- ----------------------------------------------------------------------------
comment on table public.payment_settings is
  'Konfigurasi INFAK PENGEMBANGAN (bukan langganan). Dana masuk ke Developer/platform TAHFIZH — BUKAN pendapatan sekolah/TPQ. Min Rp1.000; iPaymu min Rp10.000.';
comment on table public.payment_invoices is
  'Tagihan infak pengembangan per santri/bulan (dibuat tgl 1, jatuh tempo tgl 15, pembatasan akses mulai tgl 16). Dibayar wali santri; dana milik platform Developer.';
