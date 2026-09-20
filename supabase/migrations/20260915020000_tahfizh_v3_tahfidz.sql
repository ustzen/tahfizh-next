-- ============================================================================
-- TAHFIZH V3 — Modul Tahfidz
-- New migration; does NOT alter V1/V2 tables destructively.
--
-- Adds:
--   * tahfidz_surahs            (GLOBAL master surat — platform-provided seed)
--   * tahfidz_tenant_surahs     (tenant configuration: pick/rename/reorder/
--                                activate + tenant-specific custom surahs)
--   * tahfidz_settings          (per-tenant assessment mode: CENTANG/HURUF/ANGKA)
--   * tahfidz_grade_settings    (per-tenant grade config for HURUF mode)
--   * tahfidz_assessments       (current state per student+surah)
--   * tahfidz_assessment_history (append-only history — trigger-written)
--   * tahfidz_mode_changes      (audit: who/when/old/new mode + mapping)
--   * RPCs: tahfidz_save_assessment(s), tahfidz_teacher_summaries,
--           tahfidz_convert_grades (transactional, ALL-OR-NOTHING)
--   * Full RLS on every table
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum types
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.tahfidz_mode as enum ('CENTANG', 'HURUF', 'ANGKA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tahfidz_progress as enum ('BELUM', 'DIPELAJARI', 'DINILAI');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. GLOBAL MASTER SURAT (platform-owned; rule #32: no per-tenant duplication)
--    Reads are open to authenticated users; writes are NOT exposed to clients
--    (platform/Developer manages master via service role).
--    `name` is the canonical display name; tenant rows may override locally.
-- ============================================================================
create table if not exists public.tahfidz_surahs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tahfidz_surahs_order_idx on public.tahfidz_surahs (sort_order);

-- Seed: Juz 30, order starts at An-Nas (rule #6) — idempotent.
insert into public.tahfidz_surahs (name, sort_order) values
  ('An-Nas', 1),
  ('Al-Falaq', 2),
  ('Al-Ikhlas', 3),
  ('Al-Lahab', 4),
  ('An-Nasr', 5),
  ('Al-Kafirun', 6),
  ('Al-Kautsar', 7),
  ('Al-Ma''un', 8),
  ('Quraisy', 9),
  ('Al-Fil', 10),
  ('Al-Humazah', 11),
  ('Al-''Asr', 12),
  ('At-Takatsur', 13),
  ('Al-Qari''ah', 14),
  ('Al-''Adiyat', 15),
  ('Az-Zalzalah', 16),
  ('Al-Bayyinah', 17),
  ('Al-Qadr', 18),
  ('Al-''Alaq', 19),
  ('At-Tin', 20),
  ('Al-Insyirah', 21),
  ('Ad-Duha', 22),
  ('Al-Lail', 23),
  ('Asy-Syams', 24),
  ('Al-Balad', 25),
  ('Al-Fajr', 26),
  ('Al-Ghasyiyah', 27),
  ('Al-A''la', 28),
  ('At-Tariq', 29),
  ('Al-Buruj', 30),
  ('Al-Insyiqaq', 31),
  ('Al-Mutaffifin', 32),
  ('Al-Infitar', 33),
  ('At-Takwir', 34),
  ('''Abasa', 35),
  ('An-Nazi''at', 36),
  ('An-Naba''', 37)
on conflict (name) do nothing;

-- ============================================================================
-- 2. TENANT SURAH CONFIGURATION
--    One row per (tenant, surah) the lembaga uses, plus tenant-custom surahs
--    (surah_id null). display name = name_override ?? global name (rule #32).
--    History references rows here, so renaming never breaks histori (rule #10)
--    and deletes of used rows are blocked by FK (rule #9).
-- ============================================================================
create table if not exists public.tahfidz_tenant_surahs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  surah_id      uuid references public.tahfidz_surahs (id) on delete restrict,
  name_override text check (char_length(name_override) between 1 and 60),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, surah_id),
  constraint tenant_surah_has_source check (
    (surah_id is not null) or (name_override is not null)
  )
);

create index if not exists tahfidz_tenant_surahs_tenant_idx
  on public.tahfidz_tenant_surahs (tenant_id, is_active, sort_order);

drop trigger if exists tahfidz_tenant_surahs_updated_at on public.tahfidz_tenant_surahs;
create trigger tahfidz_tenant_surahs_updated_at
  before update on public.tahfidz_tenant_surahs
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. TAHFIDZ SETTINGS (1:1 tenant) + GRADE SETTINGS (HURUF mode)
-- ============================================================================
create table if not exists public.tahfidz_settings (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  mode       public.tahfidz_mode not null default 'CENTANG',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tahfidz_settings_updated_at on public.tahfidz_settings;
create trigger tahfidz_settings_updated_at
  before update on public.tahfidz_settings
  for each row execute function public.touch_updated_at();

create table if not exists public.tahfidz_grade_settings (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 10),
  min_value  integer not null check (min_value between 1 and 100),
  max_value  integer not null check (max_value between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, label),
  constraint grade_range_valid check (min_value <= max_value)
);

create index if not exists tahfidz_grade_settings_tenant_idx
  on public.tahfidz_grade_settings (tenant_id, sort_order);

-- ============================================================================
-- 4. ASSESSMENTS (current state; one row per student+surah)
--    * score_value: numeric (ANGKA) or NULL (CENTANG ✓ / HURUF label-only)
--    * score_label: grade label (HURUF) or NULL
--    * status: BELUM / DIPELAJARI / DINILAI (rule #25 — simple, extensible)
--    * teacher_id / assessed_by / assessed_at: kewenangan guru (rule #28)
-- ============================================================================
create table if not exists public.tahfidz_assessments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  tenant_surah_id uuid not null references public.tahfidz_tenant_surahs (id) on delete cascade,
  teacher_id      uuid references public.teachers (id) on delete set null,
  assessed_by     uuid references public.profiles (id) on delete set null,
  assessed_at     timestamptz not null default now(),
  status          public.tahfidz_progress not null default 'DINILAI',
  score_value     integer check (score_value between 1 and 100),
  score_label     text check (char_length(score_label) between 1 and 10),
  note            text check (char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, tenant_surah_id)
);

create index if not exists tahfidz_assessments_tenant_idx
  on public.tahfidz_assessments (tenant_id, assessed_at desc);
create index if not exists tahfidz_assessments_student_idx
  on public.tahfidz_assessments (student_id);
create index if not exists tahfidz_assessments_surah_idx
  on public.tahfidz_assessments (tenant_surah_id);

drop trigger if exists tahfidz_assessments_updated_at on public.tahfidz_assessments;
create trigger tahfidz_assessments_updated_at
  before update on public.tahfidz_assessments
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 5. HISTORY (append-only; written by trigger, rule #23/#47)
--    mode_at_entry preserves which mode produced the score, so a later
--    conversion never fabricates history (rule #47).
-- ============================================================================
create table if not exists public.tahfidz_assessment_history (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  assessment_id   uuid not null references public.tahfidz_assessments (id) on delete cascade,
  student_id      uuid not null,
  tenant_surah_id uuid not null,
  teacher_id      uuid,
  assessed_by     uuid,
  mode_at_entry   public.tahfidz_mode not null,
  status          public.tahfidz_progress not null,
  score_value     integer,
  score_label     text,
  note            text,
  change_kind     text not null default 'UPDATE',  -- CREATE | UPDATE | CONVERT
  convert_detail  jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists tahfidz_history_assessment_idx
  on public.tahfidz_assessment_history (assessment_id, created_at desc);
create index if not exists tahfidz_history_student_idx
  on public.tahfidz_assessment_history (student_id, created_at desc);

-- Trigger: every INSERT/UPDATE of an assessment appends one history row.
-- During mode conversion the RPC sets the transaction-local GUC
-- 'tahfidz.converting' so rows are recorded with change_kind='CONVERT'.
create or replace function public.tahfidz_record_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_kind text;
  v_detail jsonb;
  v_raw text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'CREATE';
  else
    v_raw := current_setting('tahfidz.converting', true);
    if v_raw is not null and v_raw <> '' then
      v_kind := 'CONVERT';
      v_detail := v_raw::jsonb;
    else
      v_kind := 'UPDATE';
    end if;
  end if;

  insert into public.tahfidz_assessment_history (
    tenant_id, assessment_id, student_id, tenant_surah_id,
    teacher_id, assessed_by, mode_at_entry, status,
    score_value, score_label, note, change_kind, convert_detail
  ) values (
    new.tenant_id, new.id, new.student_id, new.tenant_surah_id,
    new.teacher_id, new.assessed_by, coalesce(new.mode_at_entry_cache, public.tahfidz_settings_mode(new.tenant_id)), new.status,
    new.score_value, new.score_label, new.note, v_kind, v_detail
  );
  return new;
end;
$$;

-- Helper: current tenant mode (used by the history trigger).
create or replace function public.tahfidz_settings_mode(p_tenant uuid)
returns public.tahfidz_mode
language sql stable security definer set search_path = public
as $$
  select mode from public.tahfidz_settings where tenant_id = p_tenant
$$;

-- Column storing the mode that produced the current score (exact history,
-- rule #47). Stamped automatically on write; set explicitly by conversion.
alter table public.tahfidz_assessments
  add column if not exists mode_at_entry_cache public.tahfidz_mode;

-- Record the mode snapshot automatically on write.
create or replace function public.tahfidz_stamp_mode()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.mode_at_entry_cache := coalesce(new.mode_at_entry_cache, public.tahfidz_settings_mode(new.tenant_id));
  return new;
end;
$$;

drop trigger if exists tahfidz_assessments_stamp_mode on public.tahfidz_assessments;
create trigger tahfidz_assessments_stamp_mode
  before insert or update on public.tahfidz_assessments
  for each row execute function public.tahfidz_stamp_mode();

drop trigger if exists tahfidz_assessments_history on public.tahfidz_assessments;
create trigger tahfidz_assessments_history
  after insert or update on public.tahfidz_assessments
  for each row execute function public.tahfidz_record_history();

-- ============================================================================
-- 6. MODE CHANGE AUDIT (rule #48)
-- ============================================================================
create table if not exists public.tahfidz_mode_changes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  changed_by   uuid references public.profiles (id),
  from_mode    public.tahfidz_mode not null,
  to_mode      public.tahfidz_mode not null,
  method       text not null default 'NONE',   -- LOWER | MIDDLE | UPPER | RANGE | CUSTOM | CHECK | NONE
  mapping      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists tahfidz_mode_changes_tenant_idx
  on public.tahfidz_mode_changes (tenant_id, created_at desc);

-- ============================================================================
-- 7. RPC — GURU ASSESSMENTS (server-side validation, transactional)
--    Resolves teacher + relationship from the authenticated session ONLY
--    (rule #35: student_id/teacher_id from the client are never trusted).
-- ============================================================================
create or replace function public.tahfidz_save_assessment(
  p_student_id     uuid,
  p_tenant_surah_id uuid,
  p_status         text,
  p_score_value    integer default null,
  p_score_label    text    default null,
  p_note           text    default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_teacher  public.teachers;
  v_mode     public.tahfidz_mode;
  v_surah    public.tahfidz_tenant_surahs;
  v_student  public.students;
  v_status   public.tahfidz_progress;
begin
  -- 1. Session + role (USTADZ only — Admin does not write guru data, rule #30)
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id
      and full_name ilike v_profile.full_name
    order by created_at desc
    limit 1;
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  -- 2. Relationship: student must be assigned to THIS teacher
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then
    raise exception 'SANTRI_BUKAN_BINAAN';
  end if;

  -- 3. Surah must be an ACTIVE surah of this tenant
  select * into v_surah from public.tahfidz_tenant_surahs
    where id = p_tenant_surah_id and tenant_id = v_profile.tenant_id and is_active;
  if v_surah is null then
    raise exception 'SURAT_TIDAK_AKTIF';
  end if;

  select * into v_student from public.students
    where id = p_student_id and tenant_id = v_profile.tenant_id;
  if v_student is null then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  -- 4. Status + score validation per tenant mode (rules #12-#15)
  v_status := p_status::public.tahfidz_progress;
  v_mode := public.tahfidz_settings_mode(v_profile.tenant_id);
  if v_mode is null then v_mode := 'CENTANG'; end if;

  if v_status is null then
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  if v_status = 'DINILAI' then
    if v_mode = 'ANGKA' then
      if p_score_value is null or p_score_value < 1 or p_score_value > 100 then
        raise exception 'NILAI_ANGKA_TIDAK_VALID';
      end if;
    elsif v_mode = 'HURUF' then
      if p_score_label is null or not exists (
        select 1 from public.tahfidz_grade_settings g
        where g.tenant_id = v_profile.tenant_id and g.label = p_score_label
      ) then
        raise exception 'GRADE_TIDAK_VALID';
      end if;
    else -- CENTANG: ✓ only — no score payload
      null;
    end if;
  else
    -- BELUM / DIPELAJARI carry no score
    p_score_value := null;
    p_score_label := null;
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  -- 5. Upsert current state (trigger appends history)
  insert into public.tahfidz_assessments (
    tenant_id, student_id, tenant_surah_id, teacher_id, assessed_by,
    assessed_at, status, score_value, score_label, note
  ) values (
    v_profile.tenant_id, p_student_id, p_tenant_surah_id, v_teacher.id, v_uid,
    now(), v_status, p_score_value, p_score_label, p_note
  )
  on conflict (student_id, tenant_surah_id) do update set
    teacher_id  = excluded.teacher_id,
    assessed_by = excluded.assessed_by,
    assessed_at = excluded.assessed_at,
    status      = excluded.status,
    score_value = excluded.score_value,
    score_label = excluded.score_label,
    note        = excluded.note;
end;
$$;

-- Bulk variant: one transaction for the whole batch (rule #44, #50).
create or replace function public.tahfidz_save_assessments_bulk(p_items jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'BATCH_KOSONG';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'BATCH_TERLALU_BESAR';
  end if;

  foreach v_item in array p_items loop
    perform public.tahfidz_save_assessment(
      (v_item->>'student_id')::uuid,
      (v_item->>'tenant_surah_id')::uuid,
      v_item->>'status',
      (v_item->>'score_value')::integer,
      v_item->>'score_label',
      v_item->>'note'
    );
  end loop;
end;
$$;

-- ============================================================================
-- 8. RPC — TEACHER SUMMARIES (efficient DISTINCT ON; rule #36/#40)
-- ============================================================================
create or replace function public.tahfidz_teacher_summaries(p_teacher_id uuid)
returns table (
  student_id         uuid,
  business_code      text,
  full_name          text,
  gender             public.gender_type,
  student_status     public.entity_status,
  scored_count       bigint,
  last_surah_name    text,
  last_score_label   text,
  last_score_value   integer,
  last_mode          public.tahfidz_mode,
  last_status        public.tahfidz_progress,
  last_assessed_at   timestamptz
)
language sql
security definer set search_path = public
as $$
  with assigned as (
    select s.id, s.business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  latest as (
    select distinct on (a.student_id)
      a.student_id, a.status, a.score_value, a.score_label,
      a.mode_at_entry_cache as mode, a.assessed_at,
      coalesce(ts.name_override, gs.name) as surah_name
    from public.tahfidz_assessments a
    join public.tahfidz_tenant_surahs ts on ts.id = a.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    where a.student_id in (select id from assigned)
      and a.status = 'DINILAI'
    order by a.student_id, a.assessed_at desc
  ),
  scored as (
    select student_id, count(*)::bigint as scored_count
    from public.tahfidz_assessments
    where student_id in (select id from assigned) and status = 'DINILAI'
    group by student_id
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(sc.scored_count, 0),
    l.surah_name, l.score_label, l.score_value, l.mode, l.status, l.assessed_at
  from assigned a
  left join latest l on l.student_id = a.id
  left join scored sc on sc.student_id = a.id
  order by a.full_name;
$$;

-- ============================================================================
-- 9. RPC — MODE CONVERSION (transactional, ALL-OR-NOTHING; rules #16-#22, #50)
--    p_mapping examples:
--      HURUF→ANGKA: {"A":95,"B":83}   CENTANG→ANGKA: {"CHECK":100}
--      CENTANG→HURUF: {"CHECK":"A"}   ANGKA→HURUF / →CENTANG: {} (range/check)
--    Any unmapped existing score raises → whole transaction rolls back.
-- ============================================================================
create or replace function public.tahfidz_convert_grades(
  p_to_mode text,
  p_method  text,
  p_mapping jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_from    public.tahfidz_mode;
  v_to      public.tahfidz_mode;
  v_target  public.tahfidz_mode;
  v_row     public.tahfidz_assessments;
  v_label   text;
  v_value   integer;
  v_status  public.tahfidz_progress;
  v_count   integer := 0;
  v_detail  jsonb;
  v_guc     text;
begin
  -- ADMIN only (rule #30)
  if (select role from public.profiles where id = v_uid) <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;
  v_tenant := (select tenant_id from public.profiles where id = v_uid);
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  v_to := p_to_mode::public.tahfidz_mode;
  if v_to is null then raise exception 'MODE_TIDAK_VALID'; end if;

  select mode into v_from from public.tahfidz_settings where tenant_id = v_tenant;
  v_from := coalesce(v_from, 'CENTANG');
  if v_from = v_to then raise exception 'MODE_SAMA'; end if;

  -- Mark the transaction so the history trigger records CONVERT rows.
  v_detail := jsonb_build_object(
    'from', v_from, 'to', v_to, 'method', p_method, 'mapping', p_mapping
  );
  perform set_config('tahfidz.converting', v_detail::text, true);

  for v_row in
    select * from public.tahfidz_assessments
    where tenant_id = v_tenant and status = 'DINILAI'
    for update
  loop
    v_label  := null;
    v_value  := null;
    v_status := 'DINILAI';
    v_target := v_to;

    -- Resolve new score from the CURRENT stored score
    if v_row.score_label is not null then
      -- HURUF source
      if v_to = 'ANGKA' then
        v_value := (p_mapping ->> v_row.score_label)::integer;
        if v_value is null or v_value < 1 or v_value > 100 then
          raise exception 'KONVERSI_BELUM_LENGKAP:%', v_row.score_label;
        end if;
      elsif v_to = 'CENTANG' then
        null; -- everything becomes ✓
      end if;
    elsif v_row.score_value is not null then
      -- ANGKA source
      if v_to = 'HURUF' then
        select g.label into v_label from public.tahfidz_grade_settings g
        where g.tenant_id = v_tenant
          and v_row.score_value between g.min_value and g.max_value
        order by g.sort_order limit 1;
        if v_label is null then
          raise exception 'KONVERSI_BELUM_LENGKAP:%', v_row.score_value;
        end if;
      elsif v_to = 'CENTANG' then
        null;
      end if;
    else
      -- CENTANG source (✓)
      if v_to = 'ANGKA' then
        v_value := (p_mapping ->> 'CHECK')::integer;
        if v_value is null or v_value < 1 or v_value > 100 then
          raise exception 'KONVERSI_BELUM_LENGKAP:CHECK';
        end if;
      elsif v_to = 'HURUF' then
        v_label := p_mapping ->> 'CHECK';
        if v_label is null or not exists (
          select 1 from public.tahfidz_grade_settings g
          where g.tenant_id = v_tenant and g.label = v_label
        ) then
          raise exception 'KONVERSI_BELUM_LENGKAP:CHECK';
        end if;
      end if;
    end if;

    update public.tahfidz_assessments set
      mode_at_entry_cache = v_target,
      score_value = v_value,
      score_label = v_label
    where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  -- Switch mode + audit (same transaction — rule #50)
  insert into public.tahfidz_settings (tenant_id, mode) values (v_tenant, v_to)
  on conflict (tenant_id) do update set mode = excluded.mode;

  insert into public.tahfidz_mode_changes (tenant_id, changed_by, from_mode, to_mode, method, mapping)
  values (v_tenant, v_uid, v_from, v_to, p_method, p_mapping);

  perform set_config('tahfidz.converting', '', false);
  return v_count;
end;
$$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================
alter table public.tahfidz_surahs            enable row level security;
alter table public.tahfidz_tenant_surahs     enable row level security;
alter table public.tahfidz_settings          enable row level security;
alter table public.tahfidz_grade_settings    enable row level security;
alter table public.tahfidz_assessments       enable row level security;
alter table public.tahfidz_assessment_history enable row level security;
alter table public.tahfidz_mode_changes      enable row level security;

-- Global master: everyone reads; no client writes (platform-managed).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_surahs_select on public.tahfidz_surahs;
create policy tahfidz_surahs_select on public.tahfidz_surahs
  for select to authenticated using (true);

-- Tenant surah config: members read own tenant; ADMIN writes.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_tenant_surahs_select on public.tahfidz_tenant_surahs;
drop policy if exists tahfidz_tenant_surahs_admin_write on public.tahfidz_tenant_surahs;
create policy tahfidz_tenant_surahs_select on public.tahfidz_tenant_surahs
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tahfidz_tenant_surahs_admin_write on public.tahfidz_tenant_surahs
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Settings + grades: members read (guru forms need the mode); ADMIN writes.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_settings_select on public.tahfidz_settings;
drop policy if exists tahfidz_settings_admin_write on public.tahfidz_settings;
create policy tahfidz_settings_select on public.tahfidz_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tahfidz_settings_admin_write on public.tahfidz_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_grade_select on public.tahfidz_grade_settings;
drop policy if exists tahfidz_grade_admin_write on public.tahfidz_grade_settings;
create policy tahfidz_grade_select on public.tahfidz_grade_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tahfidz_grade_admin_write on public.tahfidz_grade_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Assessments:
--   USTADZ  → only students assigned to them (same tenant)
--   ADMIN/KOORDINATOR → all rows of own tenant (reads; future raport source)
--   WALI_SANTRI → none in V3 (structure ready via guardian_students for V4+)
--   Writes: no direct client policies — ONLY via tahfidz_save_assessment RPC
--   (defense in depth; the RPC validates relationship + mode rules).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_assessments_select on public.tahfidz_assessments;
create policy tahfidz_assessments_select on public.tahfidz_assessments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_history_select on public.tahfidz_assessment_history;
create policy tahfidz_history_select on public.tahfidz_assessment_history
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = tahfidz_assessment_history.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

-- Mode change audit: ADMIN reads; inserts happen inside the definer RPC only.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_mode_changes_select on public.tahfidz_mode_changes;
create policy tahfidz_mode_changes_select on public.tahfidz_mode_changes
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'ADMIN'
    or public.is_platform_developer()
  );

-- ============================================================================
-- 11. HELPER: active surah count for summaries (rule #41 — based on ACTIVE
--     tenant surahs only; exposed via a secure view-free function)
-- ============================================================================
create or replace function public.tahfidz_active_surah_count(p_tenant uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.tahfidz_tenant_surahs
  where tenant_id = p_tenant and is_active
$$;
