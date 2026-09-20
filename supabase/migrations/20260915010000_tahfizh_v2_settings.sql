-- ============================================================================
-- TAHFIZH V2 — Settings & Profile foundation
-- New migration; does NOT alter V1 tables destructively.
--
-- Adds:
--   * profiles: front_title, back_title, avatar_url, menu_order (per-user)
--   * teacher_identities      (flexible identity values per teacher)
--   * tenant_settings         (identity config, display toggles, extensible jsonb)
--   * terminologies           (tenant-specific UI labels)
--   * leader_profiles         (kepala sekolah / pimpinan)
--   * tenant_audit_log        (who/when/what for tenant config changes)
--   * storage bucket 'profile-photos' + storage RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles: extend (V1 table — additive only)
--    menu_order: jsonb array of nav labels; NULL = use role default.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists front_title  text check (char_length(front_title) <= 30),
  add column if not exists back_title   text check (char_length(back_title)  <= 30),
  add column if not exists avatar_url   text,
  add column if not exists menu_order   jsonb;

-- ----------------------------------------------------------------------------
-- 2. teacher_identities: flexible identity per teacher (NIP/NBM/NUPTK/custom)
--    The SET of identity types is configured per tenant (tenant_settings);
--    values live here keyed by identity key.
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_identities (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  identity_key text not null,               -- e.g. 'nbm', 'nip', 'nuptk', custom slug
  value        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (teacher_id, identity_key)
);

create index if not exists teacher_identities_tenant_idx
  on public.teacher_identities (tenant_id);
create index if not exists teacher_identities_teacher_idx
  on public.teacher_identities (teacher_id);

drop trigger if exists teacher_identities_updated_at on public.teacher_identities;
create trigger teacher_identities_updated_at
  before update on public.teacher_identities
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. tenant_settings: per-tenant configuration (1:1 with tenants)
--    * identity_types: jsonb array [{key,label}] — admin-defined guru identity
--    * show_teacher_identity: boolean (for future documents/raport)
--    * extra: jsonb reserved for V3+ (assessment config, etc.) — kept flexible
-- ----------------------------------------------------------------------------
create table if not exists public.tenant_settings (
  tenant_id              uuid primary key references public.tenants (id) on delete cascade,
  identity_types         jsonb not null default '[]'::jsonb,
  show_teacher_identity  boolean not null default false,
  extra                  jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists tenant_settings_updated_at on public.tenant_settings;
create trigger tenant_settings_updated_at
  before update on public.tenant_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. terminologies: tenant-specific UI labels (key -> custom label)
--    Only customized keys are stored; missing keys fall back to TAHFIZH
--    defaults resolved in src/lib/terminology.ts (DB keeps students/teachers
--    table names untouched — labels only, rule #38).
-- ----------------------------------------------------------------------------
create table if not exists public.terminologies (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  key        text not null,
  label      text not null check (char_length(label) between 1 and 40),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

drop trigger if exists terminologies_updated_at on public.terminologies;
create trigger terminologies_updated_at
  before update on public.terminologies
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. leader_profiles: kepala sekolah / pimpinan (tenant-owned, for raport later)
-- ----------------------------------------------------------------------------
create table if not exists public.leader_profiles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  full_name       text not null default '',
  front_title     text check (char_length(front_title) <= 30),
  back_title      text check (char_length(back_title)  <= 30),
  identity_key    text,                       -- which configured identity type
  identity_number text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id)
);

drop trigger if exists leader_profiles_updated_at on public.leader_profiles;
create trigger leader_profiles_updated_at
  before update on public.leader_profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6. tenant_audit_log: minimal audit for important tenant config changes
-- ----------------------------------------------------------------------------
create table if not exists public.tenant_audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  action      text not null,                  -- e.g. 'terminology.update'
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists tenant_audit_log_tenant_idx
  on public.tenant_audit_log (tenant_id, created_at desc);

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

alter table public.teacher_identities enable row level security;
alter table public.tenant_settings    enable row level security;
alter table public.terminologies      enable row level security;
alter table public.leader_profiles    enable row level security;
alter table public.tenant_audit_log   enable row level security;

-- ---------------------------------------------------------------------------
-- teacher_identities: tenant-scoped. Staff manage; ustadz may edit own values.
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists teacher_identities_select on public.teacher_identities;
drop policy if exists teacher_identities_insert on public.teacher_identities;
drop policy if exists teacher_identities_update on public.teacher_identities;
drop policy if exists teacher_identities_delete on public.teacher_identities;
create policy teacher_identities_select on public.teacher_identities
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy teacher_identities_insert on public.teacher_identities
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or exists (
        select 1 from public.teachers t
        where t.id = teacher_id
          and t.tenant_id = public.current_tenant_id()
          and public.current_role() = 'USTADZ'
      )
    )
  );

create policy teacher_identities_update on public.teacher_identities
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or exists (
        select 1 from public.teachers t
        where t.id = teacher_id
          and t.tenant_id = public.current_tenant_id()
          and public.current_role() = 'USTADZ'
      )
    )
  );

create policy teacher_identities_delete on public.teacher_identities
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR')
  );

-- ---------------------------------------------------------------------------
-- tenant_settings / terminologies / leader_profiles / audit:
--   SELECT: all members of own tenant (labels are needed to render UI).
--   WRITE: ADMIN only (Koordinator/Guru/Wali cannot change tenant config).
-- ---------------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tenant_settings_select on public.tenant_settings;
drop policy if exists tenant_settings_admin_write on public.tenant_settings;
create policy tenant_settings_select on public.tenant_settings
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy tenant_settings_admin_write on public.tenant_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists terminologies_select on public.terminologies;
drop policy if exists terminologies_admin_write on public.terminologies;
create policy terminologies_select on public.terminologies
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy terminologies_admin_write on public.terminologies
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists leader_profiles_select on public.leader_profiles;
drop policy if exists leader_profiles_admin_write on public.leader_profiles;
create policy leader_profiles_select on public.leader_profiles
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

create policy leader_profiles_admin_write on public.leader_profiles
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tenant_audit_log_select on public.tenant_audit_log;
drop policy if exists tenant_audit_log_insert on public.tenant_audit_log;
create policy tenant_audit_log_select on public.tenant_audit_log
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'DEVELOPER')
  );

create policy tenant_audit_log_insert on public.tenant_audit_log
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'DEVELOPER')
  );

-- ============================================================================
-- 8. STORAGE — profile photos (private bucket, per-user path isolation)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "profile photos read own" on storage.objects;
drop policy if exists "profile photos write own" on storage.objects;
drop policy if exists "profile photos update own" on storage.objects;
drop policy if exists "profile photos delete own" on storage.objects;

-- Read: only the owner of the file (path starts with auth.uid()).
create policy "profile photos read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Write/update/delete: only own folder. 2 MB & MIME type enforced app-side.
create policy "profile photos write own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile photos update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile photos delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
