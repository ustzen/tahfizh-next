-- ============================================================================
-- TAHFIZH V8 — HALAQAH & PRESENSI
-- ============================================================================
-- Rules: #3 terminology (labels only, technical names stay), #7-#11 structure
-- + history, #13-#26 quick attendance, #43-#49 db/relations/history,
-- #45-#47 tenant isolation + RLS + server authorization, #59 audit.
--
-- Tables:
--   * halaqahs              tenant halaqah/kelas/kelompok (business_code H-1..)
--   * halaqah_teachers      guru pengampu (is_primary → ≥1 primary allowed N)
--   * halaqah_students      ACTIVE membership + full transfer history (#10/#11)
--   * attendance_sessions   one per (halaqah, date) + general note (#30/#32)
--   * attendance_records    per student status HADIR/IZIN/SAKIT/ALPA + note
--   * attendance_history    append-only old/new status audit (#34/#59)
--
-- RPCs (SECURITY DEFINER, all verify session → role → tenant → relationship):
--   halaqah_save / halaqah_set_active / halaqah_delete
--   halaqah_set_teachers / halaqah_set_members
--   attendance_save_batch (ONE batch upsert for the whole class, #21)
--   halaqah_admin_list / halaqah_teacher_list / halaqah_detail
--   halaqah_members / attendance_day / attendance_rekap
--   attendance_student_summary (V9 raport integration, rule #62)
-- ============================================================================

-- ============================================================================
-- 1. TYPES & TABLES
-- ============================================================================

do $$ begin
  create type public.attendance_status as enum ('HADIR', 'IZIN', 'SAKIT', 'ALPA');
exception when duplicate_object then null; end $$;

create table if not exists public.halaqahs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  business_code text not null unique,
  name         text not null check (char_length(name) between 2 and 120),
  description  text check (char_length(description) <= 300),
  status       public.entity_status not null default 'ACTIVE',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists halaqahs_tenant_idx on public.halaqahs (tenant_id, status);

-- business_code H-1, H-2, ... (global counter — rule #48)
create or replace function public.halaqah_assign_code()
returns trigger language plpgsql as $$
begin
  if new.business_code is null or new.business_code = '' then
    new.business_code := public.next_business_id('halaqah', 'H-', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists halaqah_code_trg on public.halaqahs;
create trigger halaqah_code_trg
  before insert on public.halaqahs
  for each row execute function public.halaqah_assign_code();

-- ----------------------------------------------------------------------------
-- Guru pengampu: N guru per halaqah, exactly one primary enforced via unique
-- partial index (is_primary = true at most once per halaqah, rule #8).
-- ----------------------------------------------------------------------------
create table if not exists public.halaqah_teachers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  halaqah_id  uuid not null references public.halaqahs (id) on delete cascade,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (halaqah_id, teacher_id)
);

create index if not exists halaqah_teachers_teacher_idx on public.halaqah_teachers (teacher_id);
create unique index if not exists halaqah_teachers_primary_uniq
  on public.halaqah_teachers (halaqah_id) where is_primary;

-- ----------------------------------------------------------------------------
-- Membership with history (rule #9/#10): a row per placement. The ACTIVE row
-- is "current halaqah"; past rows stay forever (left_at set on transfer).
-- ----------------------------------------------------------------------------
create table if not exists public.halaqah_students (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  halaqah_id  uuid not null references public.halaqahs (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  joined_at   date not null default current_date,
  left_at     date,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (halaqah_id, student_id, joined_at)
);

create index if not exists halaqah_students_student_idx on public.halaqah_students (student_id);
create index if not exists halaqah_students_active_idx on public.halaqah_students (halaqah_id)
  where left_at is null;

-- ============================================================================
-- 2. PRESENSI — session + records (#13-#21 batch model)
-- ============================================================================

create table if not exists public.attendance_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  halaqah_id   uuid not null references public.halaqahs (id) on delete cascade,
  session_date date not null,
  general_note text check (char_length(general_note) <= 500),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (halaqah_id, session_date)   -- rule #33: no duplicate per day
);

create index if not exists attendance_sessions_tenant_date_idx
  on public.attendance_sessions (tenant_id, session_date desc);
create index if not exists attendance_sessions_halaqah_idx
  on public.attendance_sessions (halaqah_id, session_date desc);

create table if not exists public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  session_id  uuid not null references public.attendance_sessions (id) on delete cascade,
  halaqah_id  uuid not null references public.halaqahs (id) on delete cascade, -- #49: frozen context
  student_id  uuid not null references public.students (id) on delete cascade,
  status      public.attendance_status not null,
  note        text check (char_length(note) <= 300),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (session_id, student_id)     -- rule #33: no double row per student/day
);

create index if not exists attendance_records_student_idx on public.attendance_records (student_id, created_at desc);

-- Append-only audit (#34/#59): old_status → new_status, who, when.
create table if not exists public.attendance_history (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references public.attendance_records (id) on delete cascade,
  tenant_id   uuid not null,
  old_status  public.attendance_status,
  new_status  public.attendance_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists attendance_history_record_idx on public.attendance_history (record_id, changed_at desc);

create or replace function public.attendance_history_trg_fn()
returns trigger language plpgsql as $$
begin
  insert into public.attendance_history (record_id, tenant_id, old_status, new_status, changed_by)
  values (
    new.id, new.tenant_id,
    case when TG_OP = 'INSERT' then null else old.status end,
    new.status,
    coalesce(new.updated_by, new.created_by)
  );
  return new;
end;
$$;

drop trigger if exists attendance_history_trg on public.attendance_records;
create trigger attendance_history_trg
  after insert or update of status on public.attendance_records
  for each row execute function public.attendance_history_trg_fn();

-- ============================================================================
-- 3. RPC — HALAQAH MANAGEMENT (admin; koordinator read-only, rule #46)
--    Errors: AKSES_DITOLAK | HALAQAH_TIDAK_DITEMUKAN | NAMA_TIDAK_VALID |
--            GURU_TIDAK_DITEMUKAN | SANTRI_TIDAK_DITEMUKAN | HALAQAH_DIGUNAKAN
-- ============================================================================

-- Resolve the current user's teacher row (pattern from V3). Returns null when
-- the profile has no teacher record.
create or replace function public.halaqah_current_teacher()
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null then return null; end if;
  return (select t.id from public.teachers t
          where t.tenant_id = v_profile.tenant_id and t.full_name ilike v_profile.full_name
          order by t.created_at desc limit 1);
end;
$$;

-- Verify the caller's teacher row is an ACTIVE pengampu of the halaqah.
create or replace function public.halaqah_teacher_has_access(p_halaqah_id uuid, p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.halaqah_teachers ht
    join public.halaqahs h on h.id = ht.halaqah_id
    where ht.halaqah_id = p_halaqah_id
      and ht.teacher_id = p_teacher_id
      and h.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and h.status = 'ACTIVE'
  );
$$;

create or replace function public.halaqah_save(
  p_halaqah_id  uuid default null,
  p_name        text default null,
  p_description text default null,
  p_status      text default 'ACTIVE'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_id uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null or v_profile.role not in ('ADMIN', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_halaqah_id is null then
    if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 120 then
      raise exception 'NAMA_TIDAK_VALID';
    end if;
    insert into public.halaqahs (tenant_id, name, description, status, created_by)
    values (v_profile.tenant_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_status::public.entity_status, auth.uid())
    returning id into v_id;
    return v_id;
  else
    update public.halaqahs set
      name        = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      description = coalesce(nullif(btrim(coalesce(p_description, '')), ''), description),
      status      = coalesce(p_status::public.entity_status, status),
      updated_at  = now()
    where id = p_halaqah_id and tenant_id = v_profile.tenant_id;
    if not found then raise exception 'HALAQAH_TIDAK_DITEMUKAN'; end if;
    return p_halaqah_id;
  end if;
end;
$$;

create or replace function public.halaqah_set_active(p_halaqah_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid()) not in ('ADMIN', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;
  update public.halaqahs set status = case when p_active then 'ACTIVE' else 'INACTIVE' end::public.entity_status, updated_at = now()
  where id = p_halaqah_id and tenant_id = (select tenant_id from public.profiles where id = auth.uid());
  if not found then raise exception 'HALAQAH_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- Hard delete only when the halaqah has never been used (rule: histori aman —
-- same policy as V3 surah / V6 materials / V9 templates).
create or replace function public.halaqah_delete(p_halaqah_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_used boolean;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('ADMIN', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;
  if not exists (
    select 1 from public.halaqahs h
    where h.id = p_halaqah_id
      and h.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  ) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;

  select exists (
    select 1 from public.attendance_sessions s where s.halaqah_id = p_halaqah_id
  ) or exists (
    select 1 from public.halaqah_students hs where hs.halaqah_id = p_halaqah_id
  ) into v_used;

  if v_used then raise exception 'HALAQAH_DIGUNAKAN'; end if;

  delete from public.halaqah_teachers where halaqah_id = p_halaqah_id;
  delete from public.halaqahs where id = p_halaqah_id;
end;
$$;

-- Replace the pengampu set (rule #8): N teachers, one primary. Single teacher
-- input is promoted to primary automatically.
create or replace function public.halaqah_set_teachers(
  p_halaqah_id   uuid,
  p_teacher_ids  uuid[],
  p_primary_id   uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_primary uuid;
begin
  select tenant_id into v_tenant from public.profiles where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) not in ('ADMIN', 'DEVELOPER')
     or v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if not exists (select 1 from public.halaqahs where id = p_halaqah_id and tenant_id = v_tenant) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;
  if array_length(p_teacher_ids, 1) = 0 then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  -- All ids must belong to THIS tenant (never trust client, rule #47).
  if exists (
    select 1 from unnest(p_teacher_ids) t(id)
    where not exists (select 1 from public.teachers te where te.id = t.id and te.tenant_id = v_tenant)
  ) then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  v_primary := coalesce(p_primary_id, p_teacher_ids[1]);
  if not (v_primary = any (p_teacher_ids)) then
    v_primary := p_teacher_ids[1];
  end if;

  delete from public.halaqah_teachers where halaqah_id = p_halaqah_id;
  insert into public.halaqah_teachers (tenant_id, halaqah_id, teacher_id, is_primary)
  select v_tenant, p_halaqah_id, t.id, (t.id = v_primary)
  from unnest(p_teacher_ids) t(id);
end;
$$;

-- Replace ACTIVE members (rule #9-#11): closes old rows (left_at = today,
-- history preserved) and opens new ones. Attendance + learning history of the
-- old halaqah is NEVER touched (rule #11/#49).
create or replace function public.halaqah_set_members(
  p_halaqah_id  uuid,
  p_student_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.profiles where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) not in ('ADMIN', 'DEVELOPER')
     or v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if not exists (select 1 from public.halaqahs where id = p_halaqah_id and tenant_id = v_tenant) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) s(id)
    where not exists (select 1 from public.students st where st.id = s.id and st.tenant_id = v_tenant)
  ) then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  -- Close memberships that are no longer selected (history kept, #10).
  update public.halaqah_students
     set left_at = current_date
   where halaqah_id = p_halaqah_id
     and left_at is null
     and not (student_id = any (p_student_ids));

  -- Open new memberships (unique (halaqah, student, joined_at) makes this
  -- idempotent for students who return on a later date).
  insert into public.halaqah_students (tenant_id, halaqah_id, student_id, created_by)
  select v_tenant, p_halaqah_id, s.id, auth.uid()
  from unnest(p_student_ids) s(id)
  where not exists (
    select 1 from public.halaqah_students hs
    where hs.halaqah_id = p_halaqah_id and hs.student_id = s.id and hs.left_at is null
  )
  on conflict do nothing;
end;
$$;

-- Move a student to another halaqah (rule #11): old ACTIVE row closed, new
-- row opened, nothing else touched.
create or replace function public.halaqah_move_student(
  p_student_id uuid,
  p_to_halaqah uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.profiles where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) not in ('ADMIN', 'DEVELOPER')
     or v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if not exists (select 1 from public.halaqahs where id = p_to_halaqah and tenant_id = v_tenant) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and tenant_id = v_tenant) then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  update public.halaqah_students
     set left_at = current_date
   where student_id = p_student_id and left_at is null
     and halaqah_id in (select id from public.halaqahs where tenant_id = v_tenant);

  insert into public.halaqah_students (tenant_id, halaqah_id, student_id, created_by)
  values (v_tenant, p_to_halaqah, p_student_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- ============================================================================
-- 4. RPC — ATTENDANCE (rule #13-#21: ONE batch save, no request per santri)
-- ============================================================================

-- Batch upsert: one call = one halaqah-day. Creates/reuses the session, then
-- upserts every record + audit history in a single implicit transaction.
create or replace function public.attendance_save_batch(
  p_halaqah_id uuid,
  p_date       date,
  p_general_note text,
  p_records    jsonb  -- [{studentId, status, note?}]
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_session  uuid;
  v_count    int := 0;
  v_rec      jsonb;
  v_student  uuid;
  v_status   public.attendance_status;
  v_note     text;
begin
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  -- Authorization (rule #46/#47): ADMIN/KOORDINATOR (tenant-wide, read-write
  -- for admin) or the ACTIVE pengampu guru of THIS halaqah.
  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null or not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
      raise exception 'AKSES_DITOLAK';
    end if;
  elsif v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if not exists (
    select 1 from public.halaqahs
    where id = p_halaqah_id and tenant_id = v_tenant and status = 'ACTIVE'
  ) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;

  if p_date is null then raise exception 'TANGGAL_TIDAK_VALID'; end if;

  -- Session: reuse today's if it exists (rule #33), else create.
  select id into v_session from public.attendance_sessions
  where halaqah_id = p_halaqah_id and session_date = p_date;
  if v_session is null then
    insert into public.attendance_sessions (tenant_id, halaqah_id, session_date, general_note, created_by, updated_by)
    values (v_tenant, p_halaqah_id, p_date, nullif(btrim(coalesce(p_general_note, '')), ''), auth.uid(), auth.uid())
    returning id into v_session;
  else
    update public.attendance_sessions
       set general_note = nullif(btrim(coalesce(p_general_note, '')), ''),
           updated_by = auth.uid(), updated_at = now()
     where id = v_session;
  end if;

  -- Every student must be an ACTIVE member of THIS tenant's halaqah.
  for v_rec in select * from jsonb_array_elements(p_records) loop
    v_student := (v_rec ->> 'studentId')::uuid;
    v_status  := (v_rec ->> 'status')::public.attendance_status;
    v_note    := left(coalesce(v_rec ->> 'note', ''), 300);

    if v_student is null or v_status is null then
      raise exception 'DATA_TIDAK_VALID';
    end if;
    if not exists (
      select 1 from public.halaqah_students hs
      where hs.halaqah_id = p_halaqah_id and hs.student_id = v_student
        and hs.left_at is null
    ) then
      raise exception 'SANTRI_TIDAK_DITEMUKAN';
    end if;

    insert into public.attendance_records
      (tenant_id, session_id, halaqah_id, student_id, status, note, created_by, updated_by)
    values
      (v_tenant, v_session, p_halaqah_id, v_student, v_status, v_note, auth.uid(), auth.uid())
    on conflict (session_id, student_id) do update
      set status = excluded.status,
          note = excluded.note,
          updated_by = auth.uid(),
          updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- 5. RPC — READ HELPERS (tenant-scoped by session, rule #45-#47)
-- ============================================================================

-- Admin/Koordinator list with member + today attendance counts.
create or replace function public.halaqah_admin_list()
returns table (
  id uuid, business_code text, name text, description text,
  status text, teacher_names text, student_count bigint,
  teacher_ids uuid[]
)
language sql security definer set search_path = public
as $$
  select h.id, h.business_code, h.name, coalesce(h.description, ''),
         h.status::text,
         coalesce((select string_agg(t.full_name, ', ' order by ht.is_primary desc, t.full_name)
                   from public.halaqah_teachers ht
                   join public.teachers t on t.id = ht.teacher_id
                   where ht.halaqah_id = h.id), ''),
         (select count(*) from public.halaqah_students hs
          where hs.halaqah_id = h.id and hs.left_at is null),
         coalesce((select array_agg(ht2.teacher_id) from public.halaqah_teachers ht2
                   where ht2.halaqah_id = h.id), '{}')
  from public.halaqahs h
  where h.tenant_id = public.current_tenant_id()
  order by h.name;
$$;

-- Guru list: only halaqah where caller is an ACTIVE pengampu (rule #46).
create or replace function public.halaqah_teacher_list()
returns table (
  id uuid, business_code text, name text, description text,
  status text, teacher_names text, student_count bigint, is_primary boolean
)
language sql security definer set search_path = public
as $$
  select h.id, h.business_code, h.name, coalesce(h.description, ''),
         h.status::text,
         coalesce((select string_agg(t.full_name, ', ' order by ht.is_primary desc, t.full_name)
                   from public.halaqah_teachers ht
                   join public.teachers t on t.id = ht.teacher_id
                   where ht.halaqah_id = h.id), ''),
         (select count(*) from public.halaqah_students hs
          where hs.halaqah_id = h.id and hs.left_at is null),
         coalesce((select ht2.is_primary from public.halaqah_teachers ht2
                   where ht2.halaqah_id = h.id
                     and ht2.teacher_id = public.halaqah_current_teacher()
                   limit 1), false)
  from public.halaqahs h
  join public.halaqah_teachers ht3 on ht3.halaqah_id = h.id
  where h.tenant_id = public.current_tenant_id()
    and ht3.teacher_id = public.halaqah_current_teacher()
  group by h.id
  order by h.name;
$$;

-- Full detail: halaqah + teachers + ACTIVE members (rule #12).
create or replace function public.halaqah_detail(p_halaqah_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_teacher uuid := public.halaqah_current_teacher();
  v_role text;
  v_row public.halaqahs;
begin
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_row from public.halaqahs
  where id = p_halaqah_id and tenant_id = v_tenant;
  if v_row is null then raise exception 'HALAQAH_TIDAK_DITEMUKAN'; end if;

  -- Guru may only open halaqah they are pengampu of (rule #46).
  if v_role = 'USTADZ' and not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return jsonb_build_object(
    'halaqah', to_jsonb(v_row),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.full_name, 'code', t.business_code,
        'isPrimary', ht.is_primary)
        order by ht.is_primary desc, t.full_name)
      from public.halaqah_teachers ht
      join public.teachers t on t.id = ht.teacher_id
      where ht.halaqah_id = p_halaqah_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.full_name, 'code', s.business_code, 'gender', s.gender)
        order by s.full_name)
      from public.halaqah_students hs
      join public.students s on s.id = hs.student_id
      where hs.halaqah_id = p_halaqah_id and hs.left_at is null
    ), '[]'::jsonb),
    'studentCount', (select count(*) from public.halaqah_students hs
                     where hs.halaqah_id = p_halaqah_id and hs.left_at is null),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentName', s2.full_name, 'halaqahName', h2.name,
        'joinedAt', hs2.joined_at, 'leftAt', hs2.left_at)
        order by hs2.joined_at desc)
      from public.halaqah_students hs2
      join public.students s2 on s2.id = hs2.student_id
      join public.halaqahs h2 on h2.id = hs2.halaqah_id
      where hs2.student_id in (
        select student_id from public.halaqah_students where halaqah_id = p_halaqah_id
      )
    ), '[]'::jsonb)
  );
end;
$$;

-- Existing attendance for a halaqah-day (rule #33: show saved data).
create or replace function public.attendance_day(p_halaqah_id uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_teacher uuid := public.halaqah_current_teacher();
  v_role text;
begin
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;
  if not exists (select 1 from public.halaqahs where id = p_halaqah_id and tenant_id = v_tenant) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;
  if v_role = 'USTADZ' and not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return jsonb_build_object(
    'sessionId', (select id from public.attendance_sessions
                  where halaqah_id = p_halaqah_id and session_date = p_date),
    'generalNote', (select general_note from public.attendance_sessions
                    where halaqah_id = p_halaqah_id and session_date = p_date),
    'records', coalesce((
      select jsonb_object_agg(r.student_id, jsonb_build_object('status', r.status::text, 'note', r.note))
      from public.attendance_records r
      join public.attendance_sessions s2 on s2.id = r.session_id
      where s2.halaqah_id = p_halaqah_id and s2.session_date = p_date
    ), '{}'::jsonb)
  );
end;
$$;

-- Rekap per student for one halaqah over a date range (rule #35/#36).
create or replace function public.attendance_rekap(
  p_halaqah_id uuid,
  p_from date,
  p_to date
)
returns table (
  student_id uuid, student_name text, student_code text,
  hadir bigint, izin bigint, sakit bigint, alpa bigint, persen numeric
)
language sql security definer set search_path = public
as $$
  select s.id, s.full_name, s.business_code,
         count(*) filter (where r.status = 'HADIR'),
         count(*) filter (where r.status = 'IZIN'),
         count(*) filter (where r.status = 'SAKIT'),
         count(*) filter (where r.status = 'ALPA'),
         coalesce(round(
           count(*) filter (where r.status = 'HADIR')::numeric
           / nullif(count(*), 0) * 100, 0), 0)
  from public.halaqah_students hs
  join public.students s on s.id = hs.student_id
  left join public.attendance_records r
    on r.student_id = s.id
   and r.halaqah_id = p_halaqah_id
   and r.created_at::date between p_from and p_to
  where hs.halaqah_id = p_halaqah_id
    and hs.left_at is null
    and s.tenant_id = public.current_tenant_id()
  group by s.id, s.full_name, s.business_code
  order by s.full_name;
$$;

-- Per-student summary across ALL their halaqah for a month (rule #38/#62:
-- queryable by tenant/santri/halaqah/periode — used by V9 raport).
create or replace function public.attendance_student_summary(
  p_student_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'hadir', count(*) filter (where r.status = 'HADIR'),
    'izin', count(*) filter (where r.status = 'IZIN'),
    'sakit', count(*) filter (where r.status = 'SAKIT'),
    'alpa', count(*) filter (where r.status = 'ALPA'),
    'persen', coalesce(round(
      count(*) filter (where r.status = 'HADIR')::numeric / nullif(count(*), 0) * 100, 0), 0)
  )
  from public.attendance_records r
  where r.student_id = p_student_id
    and r.tenant_id = public.current_tenant_id()
    and r.created_at::date between p_from and p_to;
$$;

-- Teacher dashboard counters (rule #39).
create or replace function public.v8_teacher_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_teacher uuid := public.halaqah_current_teacher();
  v_tenant uuid := public.current_tenant_id();
  v_halaqah int;
  v_students int;
  v_present int;
  v_total_today int;
begin
  if v_teacher is null or v_tenant is null then
    return jsonb_build_object('halaqah', 0, 'students', 0, 'presentToday', 0, 'totalToday', 0);
  end if;

  select count(distinct ht.halaqah_id) into v_halaqah
  from public.halaqah_teachers ht
  join public.halaqahs h on h.id = ht.halaqah_id
  where ht.teacher_id = v_teacher and h.tenant_id = v_tenant and h.status = 'ACTIVE';

  select count(distinct hs.student_id) into v_students
  from public.halaqah_students hs
  join public.halaqahs h on h.id = hs.halaqah_id
  join public.halaqah_teachers ht on ht.halaqah_id = h.id
  where ht.teacher_id = v_teacher and hs.left_at is null and h.tenant_id = v_tenant;

  select
    count(*) filter (where r.status = 'HADIR'),
    count(*)
  into v_present, v_total_today
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  join public.halaqah_teachers ht on ht.halaqah_id = s.halaqah_id
  where ht.teacher_id = v_teacher and s.session_date = current_date;

  return jsonb_build_object(
    'halaqah', v_halaqah, 'students', v_students,
    'presentToday', v_present, 'totalToday', v_total_today
  );
end;
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (rule #45/#46)
-- ============================================================================

alter table public.halaqahs enable row level security;
alter table public.halaqah_teachers enable row level security;
alter table public.halaqah_students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_history enable row level security;

-- halaqahs --------------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "halaqah select tenant" on public.halaqahs;
drop policy if exists "halaqah insert tenant admin" on public.halaqahs;
drop policy if exists "halaqah update tenant admin" on public.halaqahs;
drop policy if exists "halaqah delete tenant admin" on public.halaqahs;
create policy "halaqah select tenant"
  on public.halaqahs for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "halaqah insert tenant admin"
  on public.halaqahs for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_platform_developer() = false
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  );

create policy "halaqah update tenant admin"
  on public.halaqahs for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  );

create policy "halaqah delete tenant admin"
  on public.halaqahs for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  );

-- halaqah_teachers --------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "halaqah teachers select tenant" on public.halaqah_teachers;
drop policy if exists "halaqah teachers write tenant admin" on public.halaqah_teachers;
create policy "halaqah teachers select tenant"
  on public.halaqah_teachers for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "halaqah teachers write tenant admin"
  on public.halaqah_teachers for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  );

-- halaqah_students --------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "halaqah students select tenant" on public.halaqah_students;
drop policy if exists "halaqah students write tenant admin" on public.halaqah_students;
create policy "halaqah students select tenant"
  on public.halaqah_students for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "halaqah students write tenant admin"
  on public.halaqah_students for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
  );

-- attendance_sessions -----------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "attendance sessions select tenant" on public.attendance_sessions;
drop policy if exists "attendance sessions write tenant" on public.attendance_sessions;
create policy "attendance sessions select tenant"
  on public.attendance_sessions for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'KOORDINATOR', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_sessions.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  );

create policy "attendance sessions write tenant"
  on public.attendance_sessions for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_sessions.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_sessions.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  );

-- attendance_records ------------------------------------------------------------
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "attendance records select tenant" on public.attendance_records;
drop policy if exists "attendance records write tenant" on public.attendance_records;
create policy "attendance records select tenant"
  on public.attendance_records for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'KOORDINATOR', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_records.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  );

create policy "attendance records write tenant"
  on public.attendance_records for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_records.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'DEVELOPER')
      or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = attendance_records.halaqah_id
          and ht.teacher_id = public.halaqah_current_teacher()
      )
    )
  );

-- attendance_history: read-only mirror of records visibility.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "attendance history select tenant" on public.attendance_history;
create policy "attendance history select tenant"
  on public.attendance_history for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- ============================================================================
-- 7. GRANTS
-- ============================================================================

grant execute on function public.halaqah_save(uuid, text, text, text) to authenticated;
grant execute on function public.halaqah_set_active(uuid, boolean) to authenticated;
grant execute on function public.halaqah_delete(uuid) to authenticated;
grant execute on function public.halaqah_set_teachers(uuid, uuid[], uuid) to authenticated;
grant execute on function public.halaqah_set_members(uuid, uuid[]) to authenticated;
grant execute on function public.halaqah_move_student(uuid, uuid) to authenticated;
grant execute on function public.attendance_save_batch(uuid, date, text, jsonb) to authenticated;
grant execute on function public.halaqah_admin_list() to authenticated;
grant execute on function public.halaqah_teacher_list() to authenticated;
grant execute on function public.halaqah_detail(uuid) to authenticated;
grant execute on function public.attendance_day(uuid, date) to authenticated;
grant execute on function public.attendance_rekap(uuid, date, date) to authenticated;
grant execute on function public.attendance_student_summary(uuid, date, date) to authenticated;
grant execute on function public.v8_teacher_dashboard() to authenticated;
