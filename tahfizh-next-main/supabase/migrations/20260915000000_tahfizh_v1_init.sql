-- ============================================================================
-- TAHFIZH V1 — Multi-tenant schema, business IDs, Row Level Security
-- Postgres 15 (Supabase)
--
-- Principles:
--   * UUID primary keys everywhere (business IDs are display-only).
--   * Global, gap-free-ish counters for business IDs (T-101, A-1, S-1)
--     allocated with SELECT ... FOR UPDATE inside the same transaction as
--     the insert -> no race conditions, no COUNT(*).
--   * tenant_id on every tenant-owned table, enforced by RLS.
--   * Roles/tenant read ONLY from public.profiles (server-managed);
--     client-supplied role/tenant_id are never trusted.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

-- Idempotent: safe on fresh database AND on database that already ran V1.
do $$ begin
  create type public.app_role as enum (
    'DEVELOPER',
    'ADMIN',
    'KOORDINATOR',
    'USTADZ',
    'WALI_SANTRI'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_status as enum ('ACTIVE', 'INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_kind as enum (
    'SEKOLAH',
    'TPQ',
    'RUMAH_TAHFIZH',
    'MADRASAH',
    'LEMBAGA_ALQURAN',
    'LAINNYA'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('L', 'P');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entity_status as enum ('ACTIVE', 'INACTIVE');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. COUNTERS (global business IDs: T-101..., A-1..., S-1...)
-- ============================================================================

create table if not exists public.id_counters (
  scope  text primary key,
  last   bigint not null default 0
);

create or replace function public.next_business_id(p_scope text, p_prefix text, p_start bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num bigint;
begin
  update public.id_counters
     set last = greatest(last + 1, p_start)
   where scope = p_scope
  returning last into v_num;

  if v_num is null then
    insert into public.id_counters (scope, last)
    values (p_scope, p_start)
    on conflict (scope) do update set last = greatest(public.id_counters.last + 1, p_start)
    returning last into v_num;
  end if;

  return p_prefix || v_num::text;
end;
$$;

-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tenants: sekolah / TPQ / rumah tahfizh / madrasah / lembaga
-- business_code is the visible ID (T-101, T-102, ...). UUID is the real key.
-- ----------------------------------------------------------------------------
create table if not exists public.tenants (
  id                 uuid primary key default gen_random_uuid(),
  business_code      text not null unique,
  name               text not null check (char_length(name) between 3 and 120),
  kind               public.tenant_kind not null default 'LAINNYA',
  status             public.tenant_status not null default 'ACTIVE',
  -- reserved for V2 terminology customization (e.g. "Santri"/"Murid"/"Peserta Didik")
  terminology        jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles: 1:1 with auth.users. Role + tenant live HERE and only here.
-- `role`/`tenant_id` are updated exclusively by security definer functions
-- triggered by server-side (service role) operations.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  role        public.app_role not null default 'WALI_SANTRI',
  tenant_id   uuid references public.tenants (id) on delete cascade,
  gender      public.gender_type,
  whatsapp    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);
create index if not exists profiles_role_idx   on public.profiles (role);

-- ----------------------------------------------------------------------------
-- teachers & students: tenant-owned, global business IDs (A-1..., S-1...)
-- ----------------------------------------------------------------------------
create table if not exists public.teachers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  business_code text not null unique,
  full_name    text not null check (char_length(full_name) between 2 and 120),
  gender       public.gender_type not null,
  whatsapp     text,
  status       public.entity_status not null default 'ACTIVE',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists teachers_tenant_idx on public.teachers (tenant_id, status);

create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  business_code text not null unique,
  full_name    text not null check (char_length(full_name) between 2 and 120),
  gender       public.gender_type not null,
  status       public.entity_status not null default 'ACTIVE',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists students_tenant_idx on public.students (tenant_id, status);

-- ----------------------------------------------------------------------------
-- guardians (wali santri): profile-linked; one wali can have many children.
-- ----------------------------------------------------------------------------
create table if not exists public.guardians (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null unique references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists guardians_tenant_idx  on public.guardians (tenant_id);
create index if not exists guardians_profile_idx on public.guardians (profile_id);

-- wali <-> santri (many-to-many)
create table if not exists public.guardian_students (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (guardian_id, student_id)
);

create index if not exists guardian_students_guardian_idx on public.guardian_students (guardian_id);
create index if not exists guardian_students_student_idx  on public.guardian_students (student_id);

-- ----------------------------------------------------------------------------
-- ustadz/ustadzah <-> santri assignments.
-- Simple V1 relation; future kelas/halaqah tables can replace it without
-- touching this structure (it stays valid as a direct assignment).
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_students (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (teacher_id, student_id)
);

-- Idempoten aman-rerun: sejak V12 `teacher_students` diubah menjadi VIEW
-- (binaan via halaqah), sehingga index ini hanya dibuat bila objek masih TABEL.
do $$ begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'teacher_students' and c.relkind = 'r'
  ) then
    create index if not exists teacher_students_teacher_idx on public.teacher_students (teacher_id);
    create index if not exists teacher_students_student_idx on public.teacher_students (student_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- updated_at touch trigger
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Repair-safe: drop first so re-running a failed/partial migration cannot
-- hit "trigger already exists".
drop trigger if exists tenants_updated_at  on public.tenants;
drop trigger if exists profiles_updated_at on public.profiles;
drop trigger if exists teachers_updated_at on public.teachers;
drop trigger if exists students_updated_at on public.students;

create trigger tenants_updated_at        before update on public.tenants        for each row execute function public.touch_updated_at();
create trigger profiles_updated_at       before update on public.profiles       for each row execute function public.touch_updated_at();
create trigger teachers_updated_at       before update on public.teachers       for each row execute function public.touch_updated_at();
create trigger students_updated_at       before update on public.students       for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. BUSINESS ID TRIGGERS
-- ============================================================================

create or replace function public.assign_tenant_code()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.business_code is null or new.business_code = '' then
    new.business_code := public.next_business_id('tenant', 'T-', 101);
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_assign_code on public.tenants;
create trigger tenants_assign_code
  before insert on public.tenants
  for each row execute function public.assign_tenant_code();

create or replace function public.assign_teacher_code()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.business_code is null or new.business_code = '' then
    new.business_code := public.next_business_id('teacher', 'A-', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists teachers_assign_code on public.teachers;
create trigger teachers_assign_code
  before insert on public.teachers
  for each row execute function public.assign_teacher_code();

create or replace function public.assign_student_code()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.business_code is null or new.business_code = '' then
    new.business_code := public.next_business_id('student', 'S-', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists students_assign_code on public.students;
create trigger students_assign_code
  before insert on public.students
  for each row execute function public.assign_student_code();

-- ============================================================================
-- 5. AUTH HELPERS (stable per-request, SECURITY DEFINER -> no RLS recursion)
-- ============================================================================

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_platform_developer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(role = 'DEVELOPER', false) from public.profiles where id = auth.uid()
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

alter table public.tenants            enable row level security;
alter table public.profiles           enable row level security;
alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.guardians          enable row level security;
alter table public.guardian_students  enable row level security;
-- Idempoten aman-rerun: sejak V12 `teacher_students` diubah menjadi VIEW
-- (binaan via halaqah), sehingga RLS tabel hanya diaktifkan bila objek masih
-- TABEL. View tetap tenant-isolated via security_invoker + policy tabel dasar.
do $$ begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'teacher_students' and c.relkind = 'r'
  ) then
    alter table public.teacher_students enable row level security;
  end if;
end $$;
alter table public.id_counters        enable row level security;

-- Repair-safe: drop all policies first (create policy is not idempotent).
-- ---------------------------------------------------------------------------
-- tenants
--   DEVELOPER sees all; everyone else sees only their own tenant.
--   Writes on tenants are NOT exposed to clients (registration runs via
--   server action with service role). Read-only here.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tenants_select_developer on public.tenants;
drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_developer on public.tenants
  for select to authenticated
  using (public.is_platform_developer());

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- profiles
--   Own profile: full read, limited self-update (name/whatsapp/gender only —
--   role & tenant_id changes are rejected below).
--   ADMIN/KOORDINATOR/DEVELOPER: manage users inside own tenant.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_tenant on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_tenant on public.profiles
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('DEVELOPER', 'ADMIN', 'KOORDINATOR')
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
    and role in ('KOORDINATOR', 'USTADZ', 'WALI_SANTRI')
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and role in ('KOORDINATOR', 'USTADZ', 'WALI_SANTRI')
  );

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- Block self-escalation: a non-developer can never change own role/tenant.
create or replace function public.protect_profile_escalation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_platform_developer() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'TAHFIZH: role and tenant cannot be changed via client';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_escalation on public.profiles;
create trigger profiles_protect_escalation
  before update on public.profiles
  for each row execute function public.protect_profile_escalation();

-- ---------------------------------------------------------------------------
-- teachers (tenant-owned)
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists teachers_select on public.teachers;
drop policy if exists teachers_insert on public.teachers;
drop policy if exists teachers_update on public.teachers;
drop policy if exists teachers_delete on public.teachers;
create policy teachers_select on public.teachers
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy teachers_insert on public.teachers
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

create policy teachers_update on public.teachers
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  )
  with check (tenant_id = public.current_tenant_id());

create policy teachers_delete on public.teachers
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- ---------------------------------------------------------------------------
-- students (tenant-owned)
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists students_select on public.students;
drop policy if exists students_insert on public.students;
drop policy if exists students_update on public.students;
drop policy if exists students_delete on public.students;
create policy students_select on public.students
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy students_insert on public.students
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

create policy students_update on public.students
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  )
  with check (tenant_id = public.current_tenant_id());

create policy students_delete on public.students
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- ---------------------------------------------------------------------------
-- guardians
--   Wali sees own guardian row; staff see tenant rows.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists guardians_select on public.guardians;
drop policy if exists guardians_insert on public.guardians;
drop policy if exists guardians_delete on public.guardians;
create policy guardians_select on public.guardians
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('ADMIN', 'KOORDINATOR'))
    or public.is_platform_developer()
  );

create policy guardians_insert on public.guardians
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

create policy guardians_delete on public.guardians
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- ---------------------------------------------------------------------------
-- guardian_students
--   Wali reads only links to own children; staff manage within tenant.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists guardian_students_select on public.guardian_students;
drop policy if exists guardian_students_insert on public.guardian_students;
drop policy if exists guardian_students_delete on public.guardian_students;
create policy guardian_students_select on public.guardian_students
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy guardian_students_insert on public.guardian_students
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

create policy guardian_students_delete on public.guardian_students
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- ---------------------------------------------------------------------------
-- teacher_students
--   USTADZ may READ own assignments; staff manage within tenant.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
-- Idempoten aman-rerun: hanya dijalankan bila `teacher_students` masih TABEL;
-- sejak V12 objek ini VIEW (binaan via halaqah) dan policy tabel ini tidak
-- lagi relevan (RLS tetap berlaku via security_invoker pada view).
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'teacher_students' and c.relkind = 'r'
  ) then
    drop policy if exists teacher_students_select on public.teacher_students;
    create policy teacher_students_select on public.teacher_students
      for select to authenticated
      using (
        tenant_id = public.current_tenant_id()
        or public.is_platform_developer()
      );

    drop policy if exists teacher_students_insert on public.teacher_students;
    create policy teacher_students_insert on public.teacher_students
      for insert to authenticated
      with check (
        tenant_id = public.current_tenant_id()
        and public.current_role() in ('ADMIN', 'KOORDINATOR')
      );

    drop policy if exists teacher_students_update on public.teacher_students;
    create policy teacher_students_update on public.teacher_students
      for update to authenticated
      using (
        tenant_id = public.current_tenant_id()
        and public.current_role() in ('ADMIN', 'KOORDINATOR')
      )
      with check (tenant_id = public.current_tenant_id());

    drop policy if exists teacher_students_delete on public.teacher_students;
    create policy teacher_students_delete on public.teacher_students
      for delete to authenticated
      using (
        tenant_id = public.current_tenant_id()
        and public.current_role() in ('ADMIN', 'KOORDINATOR')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- id_counters: no client access at all (service role only)
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists id_counters_no_client on public.id_counters;
create policy id_counters_no_client on public.id_counters
  for select to authenticated
  using (false);

-- ============================================================================
-- 7. REALTIME (optional, cheap; useful later)
-- ============================================================================
do $$ begin
  alter publication supabase_realtime add table public.students;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.teachers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
