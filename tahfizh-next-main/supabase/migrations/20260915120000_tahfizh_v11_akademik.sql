-- ============================================================================
-- TAHFIZH V11 — AKADEMIK: TAHUN AJARAN, JADWAL, MUTASI, STATUS, RIWAYAT
-- ============================================================================
-- Rules: #4-#12 academic years (tenant-scoped, one active, archive not delete),
-- #13-#16 schedules (reference only, never breaks presensi), #29-#42 student
-- mutations with history, #43-#48 development timeline, #49/#54/#55 tenant
-- isolation (RLS + definer authorization), #66 audit, #72 indexes.
--
-- Tables:
--   * academic_years          T-tenant scoped, ONE active per tenant (#7)
--   * academic_semesters      2 per year, ONE active inside the active year (#8)
--   * learning_settings       learning days checkbox state (#13)
--   * learning_schedules      per halaqah day/start/end/room (#15)
--   * student_enrollments     identity vs academic membership split (#52)
--   * student_transfers       mutasi antar halaqah + riwayat (#30/#31)
--   * student_promotions      naik level (append-only, #34)
--   * student_status_history  ACTIVE/LULUS/PINDAH/KELUAR/NONAKTIF (#35-#42)
--   * student_development_events  VIEW over existing V3-V8 data (#43)
--   * onboarding_progress     wizard state (skip/resume, #28)
--
-- RPCs (SECURITY DEFINER — session -> role -> tenant verified inside):
--   academic_year_save / academic_semester_set_active
--   learning_schedule_save / learning_schedule_delete
--   student_transfer / student_promote / student_set_status / student_transfer_out
--   onboarding_get / onboarding_complete / onboarding_skip
--   development_feed / development_summary / v11_audit
-- ============================================================================

-- ============================================================================
-- 1. TYPES
-- ============================================================================

do $$ begin
  create type public.academic_year_status as enum ('ACTIVE', 'ARCHIVE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.semester_status as enum ('AKTIF', 'SELESAI', 'BELUM');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.weekday as enum ('SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU','MINGGU');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.student_lifecycle as enum ('ACTIVE','LULUS','PINDAH','KELUAR','NONAKTIF');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. ACADEMIC YEARS (#4/#5/#7)
-- ============================================================================

create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null check (char_length(name) between 4 and 20),  -- "2026/2027"
  start_date  date not null,
  end_date    date not null,
  status      public.academic_year_status not null default 'ARCHIVE',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, name),
  constraint academic_year_period_check check (end_date > start_date)
);

create index if not exists academic_years_tenant_idx    on public.academic_years (tenant_id, start_date desc);
create index if not exists academic_years_active_idx    on public.academic_years (tenant_id) where status = 'ACTIVE';

drop trigger if exists academic_years_updated_at on public.academic_years;
create trigger academic_years_updated_at
  before update on public.academic_years
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. SEMESTERS (#6/#8) — dates are editable, nothing hard-coded
-- ============================================================================

create table if not exists public.academic_semesters (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  sequence         integer not null check (sequence in (1, 2)),
  name             text not null default '' check (char_length(name) <= 40),
  start_date       date not null,
  end_date         date not null,
  status           public.semester_status not null default 'BELUM',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academic_year_id, sequence),
  constraint semester_period_check check (end_date >= start_date)
);

create index if not exists academic_semesters_tenant_idx on public.academic_semesters (tenant_id);
create index if not exists academic_semesters_year_idx   on public.academic_semesters (academic_year_id);
create index if not exists academic_semesters_active_idx on public.academic_semesters (tenant_id) where status = 'AKTIF';

drop trigger if exists academic_semesters_updated_at on public.academic_semesters;
create trigger academic_semesters_updated_at
  before update on public.academic_semesters
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. LEARNING DAYS + SCHEDULES (#13-#16)
-- ============================================================================

create table if not exists public.learning_settings (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  days         public.weekday[] not null default '{SENIN,SELASA,RABU,KAMIS,JUMAT}',
  note         text check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists learning_settings_updated_at on public.learning_settings;
create trigger learning_settings_updated_at
  before update on public.learning_settings
  for each row execute function public.touch_updated_at();

create table if not exists public.learning_schedules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  halaqah_id  uuid not null references public.halaqahs (id) on delete cascade,
  day         public.weekday not null,
  start_time  time not null,
  end_time    time not null,
  room        text check (char_length(room) <= 60),
  note        text check (char_length(note) <= 300),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint schedule_time_check check (end_time > start_time),
  unique (halaqah_id, day, start_time)
);

create index if not exists learning_schedules_tenant_idx  on public.learning_schedules (tenant_id);
create index if not exists learning_schedules_halaqah_idx on public.learning_schedules (halaqah_id, day);

drop trigger if exists learning_schedules_updated_at on public.learning_schedules;
create trigger learning_schedules_updated_at
  before update on public.learning_schedules
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 5. STUDENT ENROLLMENTS (#11/#12/#52) — academic membership per semester
-- ============================================================================

create table if not exists public.student_enrollments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  semester_id      uuid not null references public.academic_semesters (id) on delete cascade,
  halaqah_id       uuid references public.halaqahs (id) on delete set null,
  level            text check (char_length(level) between 1 and 40),
  note             text check (char_length(note) <= 300),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, semester_id)
);

create index if not exists student_enrollments_student_idx on public.student_enrollments (student_id);
create index if not exists student_enrollments_year_idx    on public.student_enrollments (academic_year_id);
create index if not exists student_enrollments_semester_idx on public.student_enrollments (semester_id);
create index if not exists student_enrollments_halaqah_idx on public.student_enrollments (halaqah_id);
create index if not exists student_enrollments_tenant_idx  on public.student_enrollments (tenant_id);

drop trigger if exists student_enrollments_updated_at on public.student_enrollments;
create trigger student_enrollments_updated_at
  before update on public.student_enrollments
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 6. MUTATIONS — transfers (#29-#31), promotions (#32-#34), status (#35-#42)
-- ============================================================================

create table if not exists public.student_transfers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  from_halaqah_id uuid references public.halaqahs (id) on delete set null,
  to_halaqah_id  uuid not null references public.halaqahs (id) on delete cascade,
  from_teacher_id uuid references public.teachers (id) on delete set null,
  to_teacher_id  uuid references public.teachers (id) on delete set null,
  effective_date date not null default current_date,
  semester_id    uuid references public.academic_semesters (id) on delete set null,
  reason         text check (char_length(reason) <= 300),
  performed_by   uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists student_transfers_student_idx on public.student_transfers (student_id, created_at desc);
create index if not exists student_transfers_tenant_idx  on public.student_transfers (tenant_id, effective_date desc);

create table if not exists public.student_promotions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  from_level   text check (char_length(from_level) between 1 and 40),
  to_level     text not null check (char_length(to_level) between 1 and 40),
  semester_id  uuid references public.academic_semesters (id) on delete set null,
  note         text check (char_length(note) <= 300),
  performed_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists student_promotions_student_idx on public.student_promotions (student_id, created_at desc);
create index if not exists student_promotions_tenant_idx  on public.student_promotions (tenant_id);

create table if not exists public.student_status_history (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  from_status  text check (char_length(from_status) between 4 and 20),
  to_status    public.student_lifecycle not null,
  effective_date date not null default current_date,
  semester_id  uuid references public.academic_semesters (id) on delete set null,
  reason       text check (char_length(reason) <= 300),
  note         text check (char_length(note) <= 500),
  target_name  text check (char_length(target_name) <= 160),  -- lembaga tujuan (PINDAH)
  performed_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists student_status_history_student_idx on public.student_status_history (student_id, created_at desc);
create index if not exists student_status_history_tenant_idx  on public.student_status_history (tenant_id);

-- ============================================================================
-- 7. ONBOARDING PROGRESS (#17-#28)
-- ============================================================================

create table if not exists public.onboarding_progress (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  current_step integer not null default 0 check (current_step between 0 and 10),
  completed    boolean not null default false,
  dismissed    boolean not null default false,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists onboarding_progress_updated_at on public.onboarding_progress;
create trigger onboarding_progress_updated_at
  before update on public.onboarding_progress
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 8. DEVELOPMENT TIMELINE VIEW (#43/#44) — read-only over existing data
-- ============================================================================

-- Repair-safe: drop before create so re-running a failed/partial migration
-- cannot hit "view already exists" (structure unchanged).
drop view if exists public.student_development_events;
create view public.student_development_events
with (security_invoker = on) as  -- RLS of underlying tables applies (no bypass)
select s.tenant_id, s.student_id, s.assessed_at::date as event_date,
       'TAHFIDZ'::text as kind,
       coalesce(ts.name_override, q.name, 'Surah') as title,
       s.status::text as detail, t.full_name as teacher,
       s.score_label, s.assessed_at as created_at
from public.tahfidz_assessments s
left join public.tahfidz_tenant_surahs ts on ts.id = s.tenant_surah_id
left join public.tahfidz_surahs q on q.id = ts.surah_id
left join public.teachers t on t.id = s.teacher_id
union all
select s.tenant_id, s.student_id, s.assessed_date, 'SETORAN',
       coalesce(ts.name_override, q.name, 'Setoran'),
       case s.kind when 'MUROJAAH' then 'Murojaah' else 'Hafalan Baru' end
         || coalesce(' · ' || s.ayat_label, '') || ' · ' || s.result::text,
       t.full_name, s.score_label, s.created_at
from public.tahfidz_submissions s
left join public.tahfidz_tenant_surahs ts on ts.id = s.tenant_surah_id
left join public.tahfidz_surahs q on q.id = ts.surah_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assessed_at::date, 'TARTIL',
       coalesce(m.name, 'Tartil'), coalesce(s.pages_label, ''),
       t.full_name, s.score_label, s.created_at
from public.tartil_assessments s
left join public.tartil_materials m on m.id = s.material_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assessed_date, s.module_type::text,
       coalesce(
         (select h.title from public.hadith_materials h where h.id = s.hadith_id),
         (select p.title from public.daily_prayer_materials p where p.id = s.prayer_id),
         (select w.title from public.tajwid_materials w where w.id = s.tajwid_id),
         s.module_type::text),
       s.status::text, t.full_name, s.score_label, s.created_at
from public.learning_assessments s
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assigned_date, 'TUGAS',
       s.title, s.status::text, t.full_name, s.score_label, s.created_at
from public.tasks s
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.start_date, 'TARGET',
       s.title, s.status::text || coalesce(' · ' || round(s.current_value, 0)::text || '/' || round(s.target_value, 0)::text, ''),
       t.full_name, null, s.created_at
from public.targets s
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.entry_date, 'JURNAL',
       tm.name, coalesce(s.free_text, ''), t.full_name, null, s.created_at
from public.journal_entries s
left join public.journal_templates tm on tm.id = s.template_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select ar.tenant_id, ar.student_id, as2.session_date, 'PRESENSI',
       h.name, ar.status::text || coalesce(' · ' || ar.note, ''),
       null, null, ar.created_at
from public.attendance_records ar
join public.attendance_sessions as2 on as2.id = ar.session_id
join public.halaqahs h on h.id = ar.halaqah_id
union all
select s.tenant_id, s.student_id, s.effective_date, 'MUTASI',
       'Mutasi Halaqah',
       coalesce((select h.name from public.halaqahs h where h.id = s.to_halaqah_id), '') || coalesce(' · ' || s.reason, ''),
       (select t.full_name from public.teachers t where t.id = s.to_teacher_id),
       null, s.created_at
from public.student_transfers s
union all
select s.tenant_id, s.student_id, s.created_at::date, 'PROMOSI',
       'Kenaikan Level',
       coalesce(s.from_level || ' → ', '') || s.to_level,
       null, null, s.created_at
from public.student_promotions s
union all
select s.tenant_id, s.student_id, s.effective_date, 'STATUS',
       'Perubahan Status', s.to_status::text || coalesce(' · ' || s.reason, ''),
       null, null, s.created_at
from public.student_status_history s;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (#54)
-- ============================================================================

alter table public.academic_years         enable row level security;
alter table public.academic_semesters     enable row level security;
alter table public.learning_settings      enable row level security;
alter table public.learning_schedules     enable row level security;
alter table public.student_enrollments    enable row level security;
alter table public.student_transfers      enable row level security;
alter table public.student_promotions     enable row level security;
alter table public.student_status_history enable row level security;
alter table public.onboarding_progress    enable row level security;

-- Wali-of-student predicate reused below (#48).
create or replace function public.v11_is_wali_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    where gs.student_id = p_student_id and g.profile_id = auth.uid()
  );
$$;

-- Read: every tenant member. Write: ADMIN only (mutations run via RPC).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists academic_years_select on public.academic_years;
drop policy if exists academic_years_admin_write on public.academic_years;
create policy academic_years_select on public.academic_years
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());
create policy academic_years_admin_write on public.academic_years
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists academic_semesters_select on public.academic_semesters;
drop policy if exists academic_semesters_admin_write on public.academic_semesters;
create policy academic_semesters_select on public.academic_semesters
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());
create policy academic_semesters_admin_write on public.academic_semesters
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_settings_select on public.learning_settings;
drop policy if exists learning_settings_admin_write on public.learning_settings;
create policy learning_settings_select on public.learning_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());
create policy learning_settings_admin_write on public.learning_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_schedules_select on public.learning_schedules;
drop policy if exists learning_schedules_admin_write on public.learning_schedules;
create policy learning_schedules_select on public.learning_schedules
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());
create policy learning_schedules_admin_write on public.learning_schedules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Enrollments/history: staff of the tenant, or the wali of that student (#48).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists student_enrollments_select on public.student_enrollments;
drop policy if exists student_enrollments_admin_write on public.student_enrollments;
create policy student_enrollments_select on public.student_enrollments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.v11_is_wali_of(student_id)
  );
create policy student_enrollments_admin_write on public.student_enrollments
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('ADMIN','KOORDINATOR'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('ADMIN','KOORDINATOR'));

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists student_transfers_select on public.student_transfers;
create policy student_transfers_select on public.student_transfers
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.v11_is_wali_of(student_id));
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists student_promotions_select on public.student_promotions;
create policy student_promotions_select on public.student_promotions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.v11_is_wali_of(student_id));
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists student_status_history_select on public.student_status_history;
create policy student_status_history_select on public.student_status_history
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.v11_is_wali_of(student_id));

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists onboarding_progress_select on public.onboarding_progress;
drop policy if exists onboarding_progress_admin_write on public.onboarding_progress;
create policy onboarding_progress_select on public.onboarding_progress
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());
create policy onboarding_progress_admin_write on public.onboarding_progress
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- ============================================================================
-- 10. RPCs (SECURITY DEFINER — authorization verified inside, #55)
-- ============================================================================

-- Audit helper (reuses V2 tenant_audit_log, rule #66).
create or replace function public.v11_audit(p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_tenant_id() is null then return; end if;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, detail)
  values (public.current_tenant_id(), auth.uid(), p_action, p_detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tahun ajaran: create-or-update + optional activation. Enforces ONE active
-- year per tenant (#7), no overlap (#73), auto-creates both semesters (#6).
-- ---------------------------------------------------------------------------
create or replace function public.academic_year_save(
  p_id uuid, p_name text, p_start date, p_end date, p_activate boolean,
  p_s1_start date, p_s1_end date, p_s2_start date, p_s2_end date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid := p_id;
  v_existing record;
begin
  if v_tenant is null or public.current_role() <> 'ADMIN' then
    raise exception 'FORBIDDEN';
  end if;
  if p_name is null or char_length(trim(p_name)) < 4 or char_length(trim(p_name)) > 20 then
    raise exception 'BAD_NAME';
  end if;
  if p_end <= p_start then raise exception 'BAD_PERIOD'; end if;

  -- No overlapping year inside the same tenant (#73).
  if exists (
    select 1 from public.academic_years y
    where y.tenant_id = v_tenant and y.id is distinct from coalesce(p_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(y.start_date, y.end_date, '[]') && daterange(p_start, p_end, '[]')
  ) then raise exception 'YEAR_OVERLAP'; end if;

  if p_id is not null then
    select * into v_existing from public.academic_years
    where id = p_id and tenant_id = v_tenant;
    if not found then raise exception 'NOT_FOUND'; end if;
    update public.academic_years set
      name = trim(p_name), start_date = p_start, end_date = p_end
    where id = p_id;
  else
    insert into public.academic_years (tenant_id, name, start_date, end_date, created_by)
    values (v_tenant, trim(p_name), p_start, p_end, auth.uid())
    returning id into v_id;
  end if;

  -- Semesters: create when missing; update dates when provided (#6).
  if not exists (select 1 from public.academic_semesters where academic_year_id = v_id) then
    insert into public.academic_semesters (tenant_id, academic_year_id, sequence, name, start_date, end_date, status)
    values
      (v_tenant, v_id, 1, 'Semester 1', coalesce(p_s1_start, p_start), coalesce(p_s1_end, p_start + interval '6 months' - interval '1 day')::date, 'BELUM'),
      (v_tenant, v_id, 2, 'Semester 2', coalesce(p_s2_start, p_start + interval '6 months')::date, coalesce(p_s2_end, p_end), 'BELUM');
  elsif p_s1_start is not null or p_s2_start is not null then
    update public.academic_semesters set start_date = p_s1_start where academic_year_id = v_id and sequence = 1 and p_s1_start is not null;
    update public.academic_semesters set end_date   = p_s1_end   where academic_year_id = v_id and sequence = 1 and p_s1_end is not null;
    update public.academic_semesters set start_date = p_s2_start where academic_year_id = v_id and sequence = 2 and p_s2_start is not null;
    update public.academic_semesters set end_date   = p_s2_end   where academic_year_id = v_id and sequence = 2 and p_s2_end is not null;
  end if;

  if p_activate then
    perform public.academic_year_activate(v_id);
  end if;

  perform public.v11_audit('academic_year.save', jsonb_build_object('id', v_id, 'name', trim(p_name), 'activate', coalesce(p_activate, false)));
  return v_id;
end;
$$;

-- Activation: archive every other year first (rule #7/#76).
create or replace function public.academic_year_activate(p_year_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  select tenant_id into v_tenant from public.academic_years where id = p_year_id;
  if v_tenant is null or v_tenant <> public.current_tenant_id() then raise exception 'NOT_FOUND'; end if;

  update public.academic_years set status = 'ARCHIVE' where tenant_id = v_tenant and status = 'ACTIVE';
  update public.academic_years set status = 'ACTIVE' where id = p_year_id;
  update public.academic_semesters set status = 'SELESAI' where academic_year_id in (
    select id from public.academic_years where tenant_id = v_tenant and status = 'ARCHIVE') and status = 'AKTIF';

  perform public.v11_audit('academic_year.activate', jsonb_build_object('id', p_year_id));
end;
$$;

create or replace function public.academic_year_archive(p_year_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.academic_years where id = p_year_id and tenant_id = public.current_tenant_id()) then
    raise exception 'NOT_FOUND';
  end if;
  update public.academic_years set status = 'ARCHIVE' where id = p_year_id;
  update public.academic_semesters set status = 'SELESAI' where academic_year_id = p_year_id and status = 'AKTIF';
  perform public.v11_audit('academic_year.archive', jsonb_build_object('id', p_year_id));
end;
$$;

-- One active semester inside the active year (#8/#73).
create or replace function public.academic_semester_set_active(p_semester_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_year uuid; v_tenant uuid;
begin
  if public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  select academic_year_id, tenant_id into v_year, v_tenant
  from public.academic_semesters where id = p_semester_id;
  if v_tenant is null or v_tenant <> public.current_tenant_id() then raise exception 'NOT_FOUND'; end if;

  update public.academic_semesters set status = 'SELESAI'
  where academic_year_id = v_year and status = 'AKTIF' and id <> p_semester_id;
  update public.academic_semesters set status = 'AKTIF' where id = p_semester_id;
  perform public.v11_audit('semester.activate', jsonb_build_object('id', p_semester_id));
end;
$$;

create or replace function public.academic_semester_set_status(p_semester_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('AKTIF','SELESAI','BELUM') then raise exception 'BAD_STATUS'; end if;
  if not exists (select 1 from public.academic_semesters where id = p_semester_id and tenant_id = public.current_tenant_id()) then
    raise exception 'NOT_FOUND';
  end if;
  update public.academic_semesters set status = p_status::public.semester_status where id = p_semester_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jadwal (#15) — ADMIN only; presensi untouched (#16).
-- ---------------------------------------------------------------------------
create or replace function public.learning_schedule_save(
  p_id uuid, p_halaqah_id uuid, p_day text, p_start time, p_end time, p_room text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid := p_id;
begin
  if v_tenant is null or public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  if p_day not in ('SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU','MINGGU') then raise exception 'BAD_DAY'; end if;
  if p_end <= p_start then raise exception 'BAD_TIME'; end if;
  if not exists (select 1 from public.halaqahs where id = p_halaqah_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND';
  end if;

  if p_id is not null then
    update public.learning_schedules set halaqah_id = p_halaqah_id, day = p_day::public.weekday,
      start_time = p_start, end_time = p_end, room = nullif(trim(coalesce(p_room, '')), '')
    where id = p_id and tenant_id = v_tenant;
    if not found then raise exception 'NOT_FOUND'; end if;
  else
    insert into public.learning_schedules (tenant_id, halaqah_id, day, start_time, end_time, room, created_by)
    values (v_tenant, p_halaqah_id, p_day::public.weekday, p_start, p_end, nullif(trim(coalesce(p_room, '')), ''), auth.uid())
    returning id into v_id;
  end if;
  perform public.v11_audit('schedule.save', jsonb_build_object('id', v_id, 'halaqah', p_halaqah_id, 'day', p_day));
  return v_id;
end;
$$;

create or replace function public.learning_schedule_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  delete from public.learning_schedules where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutasi antar halaqah (#29-#31): closes old membership, opens the new one,
-- keeps full history. No duplicate ACTIVE enrollment (#73).
-- ---------------------------------------------------------------------------
create or replace function public.student_transfer(
  p_student_id uuid, p_to_halaqah_id uuid, p_effective_date date,
  p_semester_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.current_role();
  v_old record; v_to record; v_id uuid; v_from_teacher uuid; v_to_teacher uuid;
begin
  if v_tenant is null or v_role not in ('ADMIN','KOORDINATOR') then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.students where id = p_student_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND';
  end if;
  select id, tenant_id into v_to from public.halaqahs where id = p_to_halaqah_id;
  if v_to is null or v_to.tenant_id <> v_tenant then raise exception 'NOT_FOUND'; end if;

  select hs.halaqah_id, h.id as teacher_halaqah into v_old
  from public.halaqah_students hs
  left join public.halaqah_teachers ht on ht.halaqah_id = hs.halaqah_id and ht.is_primary
  where hs.student_id = p_student_id and hs.left_at is null
  limit 1;

  if v_old.halaqah_id = p_to_halaqah_id then raise exception 'SAME_HALAQAH'; end if;

  select ht.teacher_id into v_to_teacher
  from public.halaqah_teachers ht where ht.halaqah_id = p_to_halaqah_id and ht.is_primary limit 1;
  select ht.teacher_id into v_from_teacher
  from public.halaqah_teachers ht where ht.halaqah_id = v_old.halaqah_id and ht.is_primary limit 1;

  if v_old.halaqah_id is not null then
    update public.halaqah_students set left_at = coalesce(p_effective_date, current_date)
    where student_id = p_student_id and halaqah_id = v_old.halaqah_id and left_at is null;
  end if;

  insert into public.halaqah_students (tenant_id, halaqah_id, student_id, joined_at, created_by)
  values (v_tenant, p_to_halaqah_id, p_student_id, coalesce(p_effective_date, current_date), auth.uid());

  insert into public.student_transfers
    (tenant_id, student_id, from_halaqah_id, to_halaqah_id, from_teacher_id, to_teacher_id,
     effective_date, semester_id, reason, performed_by)
  values
    (v_tenant, p_student_id, v_old.halaqah_id, p_to_halaqah_id, v_from_teacher, v_to_teacher,
     coalesce(p_effective_date, current_date), p_semester_id, nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
  returning id into v_id;

  perform public.v11_audit('student.transfer', jsonb_build_object('student', p_student_id, 'to', p_to_halaqah_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk promotion (#32/#33): per-semester enrollment keeps history (#34/#78).
-- ---------------------------------------------------------------------------
create or replace function public.student_promote(
  p_student_ids jsonb, p_to_level text, p_semester_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.current_role();
  v_sem record; s record; v_old text; v_count int := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  if v_tenant is null or v_role not in ('ADMIN','KOORDINATOR') then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_student_ids) <> 'array' or jsonb_array_length(p_student_ids) = 0 then
    raise exception 'EMPTY';
  end if;
  if p_to_level is null or char_length(trim(p_to_level)) < 1 or char_length(trim(p_to_level)) > 40 then
    raise exception 'BAD_LEVEL';
  end if;
  select * into v_sem from public.academic_semesters where id = p_semester_id and tenant_id = v_tenant;
  if v_sem.id is null then raise exception 'NOT_FOUND'; end if;

  for s in select value #>> '{}' as sid from jsonb_array_elements(p_student_ids) loop
    begin
      if not exists (select 1 from public.students where id = s.sid::uuid and tenant_id = v_tenant) then
        v_failed := v_failed || jsonb_build_object('id', s.sid, 'reason', 'not_found');
        continue;
      end if;
      select e.level into v_old from public.student_enrollments e
      where e.student_id = s.sid::uuid and e.semester_id = p_semester_id;

      if v_old is not null then
        update public.student_enrollments set level = trim(p_to_level)
        where student_id = s.sid::uuid and semester_id = p_semester_id;
      else
        insert into public.student_enrollments
          (tenant_id, student_id, academic_year_id, semester_id, halaqah_id, level, created_by)
        select v_tenant, s.sid::uuid, v_sem.academic_year_id, p_semester_id,
          (select hs.halaqah_id from public.halaqah_students hs where hs.student_id = s.sid::uuid and hs.left_at is null limit 1),
          trim(p_to_level), auth.uid();
      end if;

      insert into public.student_promotions (tenant_id, student_id, from_level, to_level, semester_id, note, performed_by)
      values (v_tenant, s.sid::uuid, v_old, trim(p_to_level), p_semester_id, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
      v_count := v_count + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('id', s.sid, 'reason', sqlerrm);
    end;
  end loop;

  perform public.v11_audit('student.promote', jsonb_build_object('count', v_count, 'level', trim(p_to_level), 'semester', p_semester_id));
  return jsonb_build_object('promoted', v_count, 'failed', v_failed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Status lifecycle (#35-#42/#79/#80): history always kept, nothing deleted.
-- Leaving states close the active halaqah membership.
-- ---------------------------------------------------------------------------
create or replace function public.student_set_status(
  p_student_id uuid, p_status text, p_effective_date date, p_semester_id uuid,
  p_reason text, p_note text, p_target_name text
) returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_old text;
begin
  if v_tenant is null or public.current_role() not in ('ADMIN','KOORDINATOR') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('ACTIVE','LULUS','PINDAH','KELUAR','NONAKTIF') then raise exception 'BAD_STATUS'; end if;
  select status::text into v_old from public.students where id = p_student_id and tenant_id = v_tenant;
  if v_old is null then raise exception 'NOT_FOUND'; end if;
  if v_old = p_status then raise exception 'SAME_STATUS'; end if;

  update public.students set status = case when p_status = 'ACTIVE' then 'ACTIVE' else 'INACTIVE' end
  where id = p_student_id;

  insert into public.student_status_history
    (tenant_id, student_id, from_status, to_status, effective_date, semester_id, reason, note, target_name, performed_by)
  values
    (v_tenant, p_student_id, v_old, p_status::public.student_lifecycle,
     coalesce(p_effective_date, current_date), p_semester_id,
     nullif(trim(coalesce(p_reason, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
     nullif(trim(coalesce(p_target_name, '')), ''), auth.uid());

  -- Non-ACTIVE students leave their halaqah; data/history stays intact (#42).
  if p_status <> 'ACTIVE' then
    update public.halaqah_students set left_at = coalesce(p_effective_date, current_date)
    where student_id = p_student_id and left_at is null;
  end if;

  perform public.v11_audit('student.status', jsonb_build_object('student', p_student_id, 'from', v_old, 'to', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding (#17-#28).
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_get()
returns public.onboarding_progress language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_row public.onboarding_progress;
begin
  if v_tenant is null then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.onboarding_progress where tenant_id = v_tenant;
  if not found then
    insert into public.onboarding_progress (tenant_id) values (v_tenant)
    on conflict (tenant_id) do nothing;
    select * into v_row from public.onboarding_progress where tenant_id = v_tenant;
  end if;
  return v_row;
end;
$$;

create or replace function public.onboarding_complete(p_step integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  if p_step < 1 or p_step > 10 then raise exception 'BAD_STEP'; end if;
  insert into public.onboarding_progress (tenant_id, current_step, updated_by)
  values (v_tenant, p_step, auth.uid())
  on conflict (tenant_id) do update set
    current_step = greatest(onboarding_progress.current_step, excluded.current_step),
    dismissed = false,
    updated_by = auth.uid();
  perform public.v11_audit('onboarding.step', jsonb_build_object('step', p_step));
end;
$$;

create or replace function public.onboarding_skip()
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  insert into public.onboarding_progress (tenant_id, dismissed, updated_by)
  values (v_tenant, true, auth.uid())
  on conflict (tenant_id) do update set dismissed = true, updated_by = auth.uid();
end;
$$;

create or replace function public.onboarding_reset()
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or public.current_role() <> 'ADMIN' then raise exception 'FORBIDDEN'; end if;
  insert into public.onboarding_progress (tenant_id, current_step, completed, dismissed, updated_by)
  values (v_tenant, 0, false, false, auth.uid())
  on conflict (tenant_id) do update set current_step = 0, completed = false, dismissed = false, updated_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Development timeline (#43-#47/#71): authorization inside; LIMIT pagination.
-- ---------------------------------------------------------------------------
create or replace function public.development_feed(
  p_student_id uuid, p_limit integer default 20, p_offset integer default 0,
  p_kind text default null, p_from date default null, p_to date default null
) returns table (
  event_date date, kind text, title text, detail text,
  teacher text, score_label text, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.current_role();
begin
  if v_tenant is null then raise exception 'FORBIDDEN'; end if;
  if v_role in ('ADMIN','KOORDINATOR','USTADZ') then
    if not exists (select 1 from public.students where id = p_student_id and tenant_id = v_tenant) then
      raise exception 'NOT_FOUND';
    end if;
  elsif v_role = 'WALI_SANTRI' then
    if not public.v11_is_wali_of(p_student_id) then raise exception 'NOT_FOUND'; end if;
  else
    raise exception 'FORBIDDEN';  -- DEVELOPER: no tenant academic access (#48)
  end if;

  return query
  select e.event_date, e.kind, e.title, e.detail, e.teacher, e.score_label, e.created_at
  from public.student_development_events e
  where e.student_id = p_student_id
    and (p_kind is null or e.kind = p_kind)
    and (p_from is null or e.event_date >= p_from)
    and (p_to is null or e.event_date <= p_to)
  order by e.event_date desc, e.created_at desc
  limit least(coalesce(p_limit, 20), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.development_summary(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.current_role();
  v_result jsonb;
begin
  if v_tenant is null then raise exception 'FORBIDDEN'; end if;
  if v_role in ('ADMIN','KOORDINATOR','USTADZ') then
    if not exists (select 1 from public.students where id = p_student_id and tenant_id = v_tenant) then
      raise exception 'NOT_FOUND';
    end if;
  elsif v_role = 'WALI_SANTRI' then
    if not public.v11_is_wali_of(p_student_id) then raise exception 'NOT_FOUND'; end if;
  else
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) into v_result
  from (select kind, count(*)::int as c from public.student_development_events
        where student_id = p_student_id group by kind) x;
  return v_result;
end;
$$;

-- ============================================================================
-- 11. GRANTS + BACKFILL
-- ============================================================================

grant execute on function
  public.academic_year_save(uuid, text, date, date, boolean, date, date, date, date),
  public.academic_year_activate(uuid), public.academic_year_archive(uuid),
  public.academic_semester_set_active(uuid), public.academic_semester_set_status(uuid, text),
  public.learning_schedule_save(uuid, uuid, text, time, time, text),
  public.learning_schedule_delete(uuid),
  public.student_transfer(uuid, uuid, date, uuid, text),
  public.student_promote(jsonb, text, uuid, text),
  public.student_set_status(uuid, text, date, uuid, text, text, text),
  public.onboarding_get(), public.onboarding_complete(integer),
  public.onboarding_skip(), public.onboarding_reset(),
  public.development_feed(uuid, integer, integer, text, date, date),
  public.development_summary(uuid), public.v11_audit(text, jsonb)
to authenticated;

-- Onboarding row for tenants that already exist (new ones auto-create via RPC).
insert into public.onboarding_progress (tenant_id)
select t.id from public.tenants t
where not exists (select 1 from public.onboarding_progress o where o.tenant_id = t.id)
on conflict (tenant_id) do nothing;
