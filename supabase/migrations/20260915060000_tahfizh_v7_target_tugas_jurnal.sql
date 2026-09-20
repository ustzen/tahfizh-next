-- ============================================================================
-- TAHFIZH V7 — MODUL TARGET, TUGAS & CUSTOM JURNAL
-- New migration; does NOT alter V1–V6 tables destructively.
--
-- Design (rule #38/#39):
--   * targets + target_progress_history    guru-defined goals per santri
--                                          (module-linked OR custom; rule #5-#7)
--   * tasks + task_status_history           assignments with V3 scoring when
--                                          DINILAI (rule #18-#20)
--   * journal_templates / journal_fields    dynamic-field engine (no new DB
--     / journal_entries / journal_values    column per field — rule #39)
--     + journal_entry_history
--
--   * RPCs: target_save, target_set_progress, target_refresh_progress,
--           target_cancel, target_teacher_list, target_student_detail,
--           task_save, task_set_status, task_teacher_list,
--           journal_template_save (ADMIN), journal_template_set_active,
--           journal_template_move, journal_template_delete,
--           journal_entry_save, journal_teacher_templates,
--           journal_teacher_entries, journal_student_entries,
--           v7_teacher_counts, v7_student_summary,
--           tahfidz_student_timeline (V7 superset — + TUGAS/JURNAL)
--   * Reuses V3 scoring engine — no second system (rule #20/#69)
--   * Reuses global IDs (T-*/A-*/S-*) — no new ID scheme
--   * Kartu Prestasi: only DINILAI tasks (rule #22) and journal entries whose
--     template has show_in_achievement = true (rule #31/#32)
--   * Full RLS (rule #40-#42); writes only via SECURITY DEFINER RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums (idempotent)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.target_status as enum (
    'BELUM_MULAI', 'BERJALAN', 'TERCAPAI', 'TERLAMBAT', 'DIBATALKAN'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum (
    'BELUM_DIKERJAKAN', 'DIKERJAKAN', 'DIKUMPULKAN', 'DINILAI', 'TERLAMBAT'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.journal_field_type as enum (
    'TEXT', 'NUMBER', 'SELECT', 'CHECKBOX', 'DATE', 'TEXTAREA'
  );
exception when duplicate_object then null; end $$;

-- Module link (rule #6/#17): the 6 learning modules + CUSTOM.
create or replace function public.v7_valid_module(p text)
returns boolean language sql immutable as $$
  select p in ('TAHFIDZ','TARTIL','SETORAN','HADITS','DOA','TAJWID','CUSTOM');
$$;

-- ============================================================================
-- 1. TARGET (rule #4-#14)
--    student-level targets (rule #5); group/halaqah columns intentionally
--    deferred — structure stays extensible via module_type + future tables.
-- ============================================================================
create table if not exists public.targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  teacher_id    uuid references public.teachers (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  module_type   text not null check (public.v7_valid_module(module_type)),
  title         text not null check (char_length(title) between 1 and 160),
  description   text check (char_length(description) <= 500),
  start_date    date not null,
  end_date      date not null,
  target_value  numeric(8,2) not null check (target_value > 0),
  current_value numeric(8,2) not null default 0 check (current_value >= 0),
  unit          text check (char_length(unit) <= 30),
  status        public.target_status not null default 'BELUM_MULAI',
  note          text check (char_length(note) <= 500),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint targets_period_check check (end_date >= start_date)
);

create index if not exists targets_tenant_idx on public.targets (tenant_id, status);
create index if not exists targets_student_idx on public.targets (student_id, status);
create index if not exists targets_teacher_idx on public.targets (teacher_id);

drop trigger if exists targets_updated_at on public.targets;
create trigger targets_updated_at
  before update on public.targets
  for each row execute function public.touch_updated_at();

-- Progress history — append-only snapshot (rule #10/#14/#58).
create table if not exists public.target_progress_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  target_id   uuid not null references public.targets (id) on delete cascade,
  student_id  uuid not null,
  old_value   numeric(8,2),
  new_value   numeric(8,2),
  old_status  public.target_status,
  new_status  public.target_status,
  source      text not null default 'MANUAL',   -- CREATE | MANUAL | AUTO | STATUS
  changed_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists target_history_target_idx
  on public.target_progress_history (target_id, created_at desc);

create or replace function public.target_record_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.target_progress_history (
      tenant_id, target_id, student_id, old_value, new_value,
      old_status, new_status, source, changed_by
    ) values (
      new.tenant_id, new.id, new.student_id, null, new.current_value,
      null, new.status, 'CREATE', new.created_by
    );
  elsif coalesce(new.current_value, -1) is distinct from coalesce(old.current_value, -1)
        or new.status is distinct from old.status then
    insert into public.target_progress_history (
      tenant_id, target_id, student_id, old_value, new_value,
      old_status, new_status, source, changed_by
    ) values (
      new.tenant_id, new.id, new.student_id, old.current_value, new.current_value,
      old.status, new.status, 'MANUAL', auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists targets_history on public.targets;
create trigger targets_history
  after insert or update on public.targets
  for each row execute function public.target_record_history();

-- ============================================================================
-- 2. TUGAS (rule #15-#22)
-- ============================================================================
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  teacher_id       uuid references public.teachers (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  module_type      text not null default 'CUSTOM' check (public.v7_valid_module(module_type)),
  title            text not null check (char_length(title) between 1 and 160),
  description      text check (char_length(description) <= 500),
  instruction      text not null check (char_length(instruction) between 1 and 1000),
  assigned_date    date not null default current_date,
  due_date         date not null,
  status           public.task_status not null default 'BELUM_DIKERJAKAN',
  score_value      integer check (score_value between 1 and 100),
  score_label      text check (char_length(score_label) between 1 and 10),
  completion_note  text check (char_length(completion_note) <= 500),
  teacher_note     text check (char_length(teacher_note) <= 500),
  completed_at     timestamptz,
  deleted_at       timestamptz,
  deleted_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists tasks_tenant_idx on public.tasks (tenant_id, status);
create index if not exists tasks_student_idx on public.tasks (student_id, status);
create index if not exists tasks_teacher_idx on public.tasks (teacher_id);

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Status history — append-only (rule #58/#62).
create table if not exists public.task_status_history (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  student_id   uuid not null,
  old_status   public.task_status,
  new_status   public.task_status,
  score_value  integer,
  score_label  text,
  note         text,
  changed_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index if not exists task_history_task_idx
  on public.task_status_history (task_id, created_at desc);

create or replace function public.task_record_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.score_value is distinct from old.score_value
     or new.score_label is distinct from old.score_label then
    insert into public.task_status_history (
      tenant_id, task_id, student_id, old_status, new_status,
      score_value, score_label, note, changed_by
    ) values (
      new.tenant_id, new.id, new.student_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status, new.score_value, new.score_label,
      case when new.status = 'DINILAI' then new.teacher_note else new.completion_note end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_history on public.tasks;
create trigger tasks_history
  after insert or update on public.tasks
  for each row execute function public.task_record_history();

-- ============================================================================
-- 3. CUSTOM JURNAL — dynamic-field engine (rule #23-#31, #39)
--    template → fields → entries → values. NO new column per admin field.
-- ============================================================================
create table if not exists public.journal_templates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  created_by            uuid references public.profiles (id) on delete set null,
  name                  text not null check (char_length(name) between 1 and 80),
  description           text check (char_length(description) <= 300),
  show_in_achievement   boolean not null default false,  -- rule #31
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists journal_templates_tenant_idx
  on public.journal_templates (tenant_id, is_active, sort_order);

drop trigger if exists journal_templates_updated_at on public.journal_templates;
create trigger journal_templates_updated_at
  before update on public.journal_templates
  for each row execute function public.touch_updated_at();

create table if not exists public.journal_fields (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  template_id  uuid not null references public.journal_templates (id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 80),
  field_type   public.journal_field_type not null,
  required     boolean not null default false,
  options      jsonb,                       -- SELECT only: ["Baik","Cukup",...]
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint journal_fields_select_options_check check (
    field_type <> 'SELECT'
    or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 1 and 20)
  ),
  -- NOTE: must NOT be named journal_fields_label_check — that name collides
  -- with the auto-generated name of the unnamed check on `label` above.
  constraint journal_fields_options_null_check check (
    field_type = 'SELECT' or options is null
  )
);

create index if not exists journal_fields_template_idx
  on public.journal_fields (template_id, sort_order);

create table if not exists public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  template_id  uuid not null references public.journal_templates (id) on delete restrict,
  student_id   uuid not null references public.students (id) on delete cascade,
  teacher_id   uuid references public.teachers (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  entry_date   date not null default current_date,
  free_text    text check (char_length(free_text) <= 500),
  deleted_at   timestamptz,
  deleted_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists journal_entries_tenant_idx
  on public.journal_entries (tenant_id, entry_date desc);
create index if not exists journal_entries_student_idx
  on public.journal_entries (student_id, entry_date desc);
create index if not exists journal_entries_template_idx
  on public.journal_entries (template_id);

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

create table if not exists public.journal_values (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  entry_id      uuid not null references public.journal_entries (id) on delete cascade,
  field_id      uuid not null references public.journal_fields (id) on delete restrict,
  value_text    text check (char_length(value_text) <= 500),
  value_number  numeric(10,2),
  value_bool    boolean,
  value_date    date,
  value_option  text check (char_length(value_option) <= 80),
  created_at    timestamptz not null default now(),
  unique (entry_id, field_id)
);

create index if not exists journal_values_entry_idx on public.journal_values (entry_id);

-- Entry history — append-only snapshot with values (rule #58).
create table if not exists public.journal_entry_history (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  entry_id         uuid not null references public.journal_entries (id) on delete cascade,
  student_id       uuid not null,
  teacher_id       uuid,
  template_id      uuid not null,
  template_name    text not null,             -- snapshot: renames never corrupt histori
  show_in_achieve  boolean not null default false,
  entry_date       date not null,
  free_text        text,
  values_snapshot  jsonb not null default '{}'::jsonb,  -- {"Field Label": "display"}
  change_kind      text not null default 'CREATE',      -- CREATE | UPDATE | SOFT_DELETE
  created_at       timestamptz not null default now()
);

create index if not exists journal_history_student_idx
  on public.journal_entry_history (student_id, created_at desc);
create index if not exists journal_history_entry_idx
  on public.journal_entry_history (entry_id);

create or replace function public.journal_record_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_values jsonb;
  v_kind   text;
  v_tmpl   record;
begin
  select coalesce(
    jsonb_object_agg(
      f.label,
      coalesce(v.value_text, v.value_number::text, v.value_bool::text, v.value_date::text, v.value_option)
    ), '{}'::jsonb
  ) into v_values
  from public.journal_values v
  join public.journal_fields f on f.id = v.field_id
  where v.entry_id = new.id;

  select * into v_tmpl from public.journal_templates where id = new.template_id;

  if tg_op = 'INSERT' then v_kind := 'CREATE';
  else v_kind := case when new.deleted_at is null then 'UPDATE' else 'SOFT_DELETE' end;
  end if;

  insert into public.journal_entry_history (
    tenant_id, entry_id, student_id, teacher_id, template_id,
    template_name, show_in_achieve, entry_date, free_text, values_snapshot, change_kind
  ) values (
    new.tenant_id, new.id, new.student_id, new.teacher_id, new.template_id,
    v_tmpl.name, v_tmpl.show_in_achievement, new.entry_date, new.free_text, v_values, v_kind
  );
  return new;
end;
$$;

drop trigger if exists journal_entries_history on public.journal_entries;
create trigger journal_entries_history
  after insert or update on public.journal_entries
  for each row execute function public.journal_record_history();

-- ============================================================================
-- 4. RPC — TARGET (guru; rule #41-#42 server authorization)
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | SANTRI_BUKAN_BINAAN |
--            JUDUL_TIDAK_VALID | PERIODE_TIDAK_VALID | TARGET_TIDAK_VALID |
--            MODUL_TIDAK_VALID | PROGRESS_TIDAK_VALID | PROGRESS_MANUAL_SAJA |
--            TARGET_TIDAK_DITEMUKAN
-- ============================================================================
create or replace function public.target_save(
  p_student_id  uuid,
  p_title       text,
  p_start_date  date,
  p_end_date    date,
  p_module      text default 'CUSTOM',
  p_description text default null,
  p_target_value numeric default 1,
  p_unit        text default null,
  p_note        text default null,
  p_target_id   uuid default null            -- set = EDIT own target
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile  public.profiles;
  v_teacher  public.teachers;
  v_id       uuid;
  v_module   text := coalesce(p_module, 'CUSTOM');
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then raise exception 'SANTRI_BUKAN_BINAAN'; end if;

  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'JUDUL_TIDAK_VALID';
  end if;

  if not public.v7_valid_module(v_module) then raise exception 'MODUL_TIDAK_VALID'; end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_start_date < (current_date - interval '1 year')::date
     or p_end_date   > (current_date + interval '2 years')::date then
    raise exception 'PERIODE_TIDAK_VALID';
  end if;

  if p_target_value is null or p_target_value <= 0 or p_target_value > 10000 then
    raise exception 'TARGET_TIDAK_VALID';
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  if p_target_id is not null then
    select id into v_id from public.targets
    where id = p_target_id and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id and deleted_at is null;
    if v_id is null then raise exception 'TARGET_TIDAK_DITEMUKAN'; end if;

    update public.targets set
      module_type  = v_module,
      title        = trim(p_title),
      description  = p_description,
      start_date   = p_start_date,
      end_date     = p_end_date,
      target_value = p_target_value,
      unit         = p_unit,
      note         = p_note
    where id = v_id;

    -- Re-evaluate status after edits (target may now be reached or overdue).
    perform public.target_recompute_status(v_id, 'MANUAL');
  else
    insert into public.targets (
      tenant_id, student_id, teacher_id, created_by, module_type, title,
      description, start_date, end_date, target_value, unit, note, status
    ) values (
      v_profile.tenant_id, p_student_id, v_teacher.id, auth.uid(), v_module, trim(p_title),
      p_description, p_start_date, p_end_date, p_target_value, p_unit, p_note,
      case when v_module = 'CUSTOM' then 'BELUM_MULAI'::public.target_status
           else 'BERJALAN'::public.target_status end
    ) returning id into v_id;

    -- Module-linked target: seed progress from actual data (rule #11).
    if v_module <> 'CUSTOM' then
      perform public.target_recompute_progress(v_id, 'AUTO');
    end if;
  end if;

  return v_id;
end;
$$;

-- Recompute current_value from real module data (rule #11/#13 — no engine
-- complexity: guru presses "Hitung dari Data" or it runs on creation).
create or replace function public.target_recompute_progress(
  p_target_id uuid,
  p_source    text default 'AUTO'
)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_target  public.targets;
  v_count   integer;
begin
  select * into v_target from public.targets
  where id = p_target_id and deleted_at is null;
  if v_target is null then raise exception 'TARGET_TIDAK_DITEMUKAN'; end if;
  if v_target.module_type = 'CUSTOM' then raise exception 'PROGRESS_MANUAL_SAJA'; end if;

  v_count := case v_target.module_type
    when 'TAHFIDZ' then (select count(*) from public.tahfidz_assessments a
                         where a.student_id = v_target.student_id and a.status = 'DINILAI')
    when 'TARTIL'  then (select count(*) from public.tartil_assessments a
                         where a.student_id = v_target.student_id and a.status = 'DINILAI'
                           and a.deleted_at is null)
    when 'SETORAN' then (select count(*) from public.tahfidz_submissions s
                         where s.student_id = v_target.student_id and s.result = 'LULUS'
                           and s.deleted_at is null)
    when 'HADITS'  then (select count(*) from public.learning_assessments a
                         where a.student_id = v_target.student_id and a.module_type = 'HADITS'
                           and a.status in ('LULUS','MENGUASAI') and a.deleted_at is null)
    when 'DOA'     then (select count(*) from public.learning_assessments a
                         where a.student_id = v_target.student_id and a.module_type = 'DOA'
                           and a.status in ('LULUS','MENGUASAI') and a.deleted_at is null)
    when 'TAJWID'  then (select count(*) from public.learning_assessments a
                         where a.student_id = v_target.student_id and a.module_type = 'TAJWID'
                           and a.status = 'MENGUASAI' and a.deleted_at is null)
    else 0
  end;

  update public.targets set
    current_value = least(v_count, v_target.target_value)
  where id = v_target.id;

  perform public.target_recompute_status(p_target_id, p_source);
  return least(v_count, v_target.target_value);
end;
$$;

-- Status rules (rule #9): TERCAPAI when current >= target; TERLAMBAT when the
-- period ended first; BERJALAN once progress started; DIBATALKAN is sticky.
create or replace function public.target_recompute_status(
  p_target_id uuid,
  p_source    text default 'MANUAL'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.targets;
begin
  select * into v from public.targets where id = p_target_id and deleted_at is null;
  if v is null then raise exception 'TARGET_TIDAK_DITEMUKAN'; end if;
  if v.status = 'DIBATALKAN' then return; end if;

  if v.current_value >= v.target_value then
    update public.targets set status = 'TERCAPAI' where id = v.id;
  elsif v.end_date < current_date then
    update public.targets set status = 'TERLAMBAT' where id = v.id;
  elsif v.current_value > 0 or v.status = 'BERJALAN' then
    update public.targets set status = 'BERJALAN' where id = v.id;
  else
    update public.targets set status = 'BELUM_MULAI' where id = v.id;
  end if;

  -- Keep the history source accurate for auto runs.
  if p_source = 'AUTO' then
    update public.target_progress_history set source = 'AUTO'
    where target_id = v.id and created_at = (
      select max(created_at) from public.target_progress_history where target_id = v.id
    );
  end if;
end;
$$;

create or replace function public.target_set_progress(
  p_target_id uuid,
  p_value     numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
  v         public.targets;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'USTADZ' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;

  select * into v from public.targets
  where id = p_target_id and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id and deleted_at is null;
  if v is null then raise exception 'TARGET_TIDAK_DITEMUKAN'; end if;
  if v.module_type = 'CUSTOM' and p_value is null then
    raise exception 'PROGRESS_TIDAK_VALID';
  end if;
  if p_value is null or p_value < 0 or p_value > v.target_value then
    raise exception 'PROGRESS_TIDAK_VALID';
  end if;

  update public.targets set current_value = p_value where id = v.id;
  perform public.target_recompute_status(v.id, 'MANUAL');
end;
$$;

create or replace function public.target_cancel(p_target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'USTADZ' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;

  update public.targets set status = 'DIBATALKAN'
  where id = p_target_id and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id and deleted_at is null;
  if not found then raise exception 'TARGET_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- Teacher list (all targets across assigned students; filter client-side).
create or replace function public.target_teacher_list()
returns table (
  id            uuid,
  student_id    uuid,
  student_name  text,
  student_code  text,
  module_type   text,
  title         text,
  description   text,
  start_date    date,
  end_date      date,
  target_value  numeric,
  current_value numeric,
  unit          text,
  status        public.target_status,
  note          text,
  teacher_name  text,
  updated_at    timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    tg.id, tg.student_id, s.full_name, s.business_code,
    tg.module_type, tg.title, tg.description, tg.start_date, tg.end_date,
    tg.target_value, tg.current_value, tg.unit, tg.status, tg.note,
    t.full_name, tg.updated_at
  from public.targets tg
  join public.students s on s.id = tg.student_id
  left join public.teachers t on t.id = tg.teacher_id
  where tg.tenant_id = public.current_tenant_id()
    and tg.deleted_at is null
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and tg.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    )
  order by tg.end_date asc, tg.created_at desc
  limit 300;
$$;

create or replace function public.target_student_detail(p_target_id uuid)
returns table (
  id            uuid,
  student_id    uuid,
  student_name  text,
  student_code  text,
  module_type   text,
  title         text,
  description   text,
  start_date    date,
  end_date      date,
  target_value  numeric,
  current_value numeric,
  unit          text,
  status        public.target_status,
  note          text,
  teacher_name  text,
  created_at    timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    tg.id, tg.student_id, s.full_name, s.business_code,
    tg.module_type, tg.title, tg.description, tg.start_date, tg.end_date,
    tg.target_value, tg.current_value, tg.unit, tg.status, tg.note,
    t.full_name, tg.created_at
  from public.targets tg
  join public.students s on s.id = tg.student_id
  left join public.teachers t on t.id = tg.teacher_id
  where tg.id = p_target_id
    and tg.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and tg.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    );
$$;

create or replace function public.target_progress_history_list(p_target_id uuid)
returns table (
  id         uuid,
  old_value  numeric,
  new_value  numeric,
  old_status public.target_status,
  new_status public.target_status,
  source     text,
  created_at timestamptz
)
language sql
security definer set search_path = public
as $$
  select h.id, h.old_value, h.new_value, h.old_status, h.new_status, h.source, h.created_at
  from public.target_progress_history h
  where h.target_id = p_target_id
    and h.tenant_id = public.current_tenant_id()
  order by h.created_at desc
  limit 100;
$$;

-- ============================================================================
-- 5. RPC — TUGAS (rule #15-#22, #53)
-- ============================================================================
create or replace function public.task_save(
  p_student_id   uuid,
  p_title        text,
  p_instruction  text,
  p_due_date     date,
  p_module       text default 'CUSTOM',
  p_description  text default null,
  p_task_id      uuid default null            -- set = EDIT own task
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
  v_id      uuid;
  v_module  text := coalesce(p_module, 'CUSTOM');
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then raise exception 'SANTRI_BUKAN_BINAAN'; end if;

  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'JUDUL_TIDAK_VALID';
  end if;
  if p_instruction is null or char_length(trim(p_instruction)) not between 1 and 1000 then
    raise exception 'INSTRUKSI_TIDAK_VALID';
  end if;
  if not public.v7_valid_module(v_module) then raise exception 'MODUL_TIDAK_VALID'; end if;
  if p_due_date is null
     or p_due_date > (current_date + interval '1 year')::date
     or p_due_date < (current_date - interval '1 year')::date then
    raise exception 'DEADLINE_TIDAK_VALID';
  end if;

  if p_task_id is not null then
    select id into v_id from public.tasks
    where id = p_task_id and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id and deleted_at is null;
    if v_id is null then raise exception 'TUGAS_TIDAK_DITEMUKAN'; end if;

    update public.tasks set
      module_type = v_module,
      title       = trim(p_title),
      description = p_description,
      instruction = trim(p_instruction),
      due_date    = p_due_date
    where id = v_id;
  else
    insert into public.tasks (
      tenant_id, student_id, teacher_id, created_by, module_type,
      title, description, instruction, assigned_date, due_date
    ) values (
      v_profile.tenant_id, p_student_id, v_teacher.id, auth.uid(), v_module,
      trim(p_title), p_description, trim(p_instruction), current_date, p_due_date
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Status update + optional grading through the V3 engine (rule #18-#20, #69).
create or replace function public.task_set_status(
  p_task_id         uuid,
  p_status          text,
  p_score_value     integer default null,
  p_score_label     text default null,
  p_completion_note text default null,
  p_teacher_note    text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
  v         public.tasks;
  v_mode    public.tahfidz_mode;
  v_status  public.task_status;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'USTADZ' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;

  select * into v from public.tasks
  where id = p_task_id and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id and deleted_at is null;
  if v is null then raise exception 'TUGAS_TIDAK_DITEMUKAN'; end if;

  if p_status not in ('BELUM_DIKERJAKAN','DIKERJAKAN','DIKUMPULKAN','DINILAI','TERLAMBAT') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_status := p_status::public.task_status;

  if v_status = 'DINILAI' then
    -- V3 scoring engine — single source of truth (rule #20/#69).
    v_mode := coalesce(public.tahfidz_settings_mode(v_profile.tenant_id), 'CENTANG');
    if v_mode = 'ANGKA' then
      if p_score_value is null or p_score_value < 1 or p_score_value > 100 then
        raise exception 'NILAI_ANGKA_TIDAK_VALID';
      end if;
    elsif v_mode = 'HURUF' then
      if p_score_label is null or not exists (
        select 1 from public.tahfidz_grade_settings g
        where g.tenant_id = v_profile.tenant_id and g.label = p_score_label
      ) then raise exception 'GRADE_TIDAK_VALID'; end if;
    end if;
  else
    p_score_value := null;
    p_score_label := null;
  end if;

  if p_completion_note is not null and char_length(p_completion_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;
  if p_teacher_note is not null and char_length(p_teacher_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  update public.tasks set
    status          = v_status,
    score_value     = p_score_value,
    score_label     = p_score_label,
    completion_note = p_completion_note,
    teacher_note    = p_teacher_note,
    completed_at    = case when v_status = 'DINILAI' then coalesce(v.completed_at, now()) else null end
  where id = v.id;
end;
$$;

create or replace function public.task_teacher_list()
returns table (
  id              uuid,
  student_id      uuid,
  student_name    text,
  student_code    text,
  module_type     text,
  title           text,
  description     text,
  instruction     text,
  assigned_date   date,
  due_date        date,
  status          public.task_status,
  score_value     integer,
  score_label     text,
  completion_note text,
  teacher_note    text,
  teacher_name    text,
  updated_at      timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    k.id, k.student_id, s.full_name, s.business_code,
    k.module_type, k.title, k.description, k.instruction,
    k.assigned_date, k.due_date, k.status, k.score_value, k.score_label,
    k.completion_note, k.teacher_note, t.full_name, k.updated_at
  from public.tasks k
  join public.students s on s.id = k.student_id
  left join public.teachers t on t.id = k.teacher_id
  where k.tenant_id = public.current_tenant_id()
    and k.deleted_at is null
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and k.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    )
  order by k.due_date asc, k.created_at desc
  limit 300;
$$;

create or replace function public.task_student_detail(p_task_id uuid)
returns table (
  id              uuid,
  student_id      uuid,
  student_name    text,
  student_code    text,
  module_type     text,
  title           text,
  description     text,
  instruction     text,
  assigned_date   date,
  due_date        date,
  status          public.task_status,
  score_value     integer,
  score_label     text,
  completion_note text,
  teacher_note    text,
  teacher_name    text,
  created_at      timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    k.id, k.student_id, s.full_name, s.business_code,
    k.module_type, k.title, k.description, k.instruction,
    k.assigned_date, k.due_date, k.status, k.score_value, k.score_label,
    k.completion_note, k.teacher_note, t.full_name, k.created_at
  from public.tasks k
  join public.students s on s.id = k.student_id
  left join public.teachers t on t.id = k.teacher_id
  where k.id = p_task_id
    and k.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and k.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    );
$$;

create or replace function public.task_status_history_list(p_task_id uuid)
returns table (
  id         uuid,
  old_status public.task_status,
  new_status public.task_status,
  score_value integer,
  score_label text,
  note       text,
  created_at timestamptz
)
language sql
security definer set search_path = public
as $$
  select h.id, h.old_status, h.new_status, h.score_value, h.score_label, h.note, h.created_at
  from public.task_status_history h
  where h.task_id = p_task_id
    and h.tenant_id = public.current_tenant_id()
  order by h.created_at desc
  limit 100;
$$;

-- ============================================================================
-- 6. RPC — CUSTOM JURNAL (rule #23-#31, #39, #54)
-- ============================================================================
create or replace function public.journal_template_save(
  p_name                 text,
  p_template_id          uuid default null,   -- set = EDIT own-tenant template
  p_description          text default null,
  p_show_in_achievement  boolean default false,
  p_fields               jsonb default '[]'::jsonb  -- [{label,type,required,options[]}]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_id      uuid;
  v_field   jsonb;
  v_type    text;
  v_opts    jsonb;
  v_order   int;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'NAMA_TIDAK_VALID';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array'
     or jsonb_array_length(p_fields) = 0 or jsonb_array_length(p_fields) > 40 then
    raise exception 'FIELD_TIDAK_VALID';
  end if;

  -- Validate every field BEFORE writing anything (all-or-nothing).
  v_order := 0;
  for v_field in select * from jsonb_array_elements(p_fields) loop
    v_order := v_order + 1;
    if coalesce(v_field ->> 'label', '') = ''
       or char_length(v_field ->> 'label') > 80 then
      raise exception 'FIELD_TIDAK_VALID';
    end if;
    v_type := coalesce(v_field ->> 'type', 'TEXT');
    if v_type not in ('TEXT','NUMBER','SELECT','CHECKBOX','DATE','TEXTAREA') then
      raise exception 'FIELD_TIDAK_VALID';
    end if;
    if v_type = 'SELECT' then
      v_opts := v_field -> 'options';
      if v_opts is null or jsonb_typeof(v_opts) <> 'array'
         or jsonb_array_length(v_opts) = 0 or jsonb_array_length(v_opts) > 20 then
        raise exception 'FIELD_TIDAK_VALID';
      end if;
      if exists (
        select 1 from jsonb_array_elements_text(v_opts) o
        where o is null or o = '' or char_length(o) > 80
      ) then raise exception 'FIELD_TIDAK_VALID'; end if;
    end if;
  end loop;

  if p_template_id is not null then
    select id into v_id from public.journal_templates
    where id = p_template_id and tenant_id = v_profile.tenant_id;
    if v_id is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

    update public.journal_templates set
      name = trim(p_name),
      description = p_description,
      show_in_achievement = coalesce(p_show_in_achievement, false)
    where id = v_id;

    -- Replace fields (entries keep history via snapshots; values FK restrict
    -- would block deletion only if referenced — entries are not touched).
    delete from public.journal_fields where template_id = v_id;
  else
    insert into public.journal_templates (
      tenant_id, created_by, name, description, show_in_achievement, sort_order
    ) values (
      v_profile.tenant_id, auth.uid(), trim(p_name), p_description,
      coalesce(p_show_in_achievement, false),
      coalesce((select max(sort_order) + 1 from public.journal_templates
                where tenant_id = v_profile.tenant_id), 1)
    ) returning id into v_id;
  end if;

  insert into public.journal_fields (
    tenant_id, template_id, label, field_type, required, options, sort_order
  )
  select
    v_profile.tenant_id, v_id,
    f ->> 'label',
    (f ->> 'type')::public.journal_field_type,
    coalesce((f ->> 'required')::boolean, false),
    case when f ->> 'type' = 'SELECT' then f -> 'options' end,
    rn
  from jsonb_array_elements(p_fields) with ordinality as t(f, rn);

  return v_id;
end;
$$;

create or replace function public.journal_template_set_active(
  p_template_id uuid,
  p_active      boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;
  update public.journal_templates set is_active = p_active
  where id = p_template_id and tenant_id = (select tenant_id from public.profiles where id = auth.uid());
  if not found then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- Simple up/down reorder (rule #30 — no complex drag & drop needed).
create or replace function public.journal_template_move(
  p_template_id uuid,
  p_direction   text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant uuid := (select tenant_id from public.profiles where id = auth.uid());
  v_cur    public.journal_templates;
  v_other  public.journal_templates;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_direction not in ('UP', 'DOWN') then raise exception 'ARAH_TIDAK_VALID'; end if;

  select * into v_cur from public.journal_templates
  where id = p_template_id and tenant_id = v_tenant;
  if v_cur is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  select * into v_other from public.journal_templates
  where tenant_id = v_tenant
    and (
      (p_direction = 'UP'   and sort_order < v_cur.sort_order)
      or
      (p_direction = 'DOWN' and sort_order > v_cur.sort_order)
    )
  order by
    case when p_direction = 'UP' then sort_order end desc,
    case when p_direction = 'DOWN' then sort_order end asc
  limit 1;
  if v_other is not null then
    update public.journal_templates set sort_order = v_cur.sort_order where id = v_other.id;
    update public.journal_templates set sort_order = v_other.sort_order where id = v_cur.id;
  end if;
end;
$$;

-- Hard delete ONLY if no entries exist (rule #57) — otherwise deactivate.
create or replace function public.journal_template_delete(p_template_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant uuid := (select tenant_id from public.profiles where id = auth.uid());
  v_used   boolean;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;
  select exists (
    select 1 from public.journal_entries e
    where e.template_id = p_template_id and e.tenant_id = v_tenant
  ) into v_used;
  if v_used then raise exception 'TEMPLATE_DIGUNAKAN'; end if;

  delete from public.journal_templates
  where id = p_template_id and tenant_id = v_tenant;
  if not found then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- GURU fill/edit (rule #29/#54): validates values against template fields.
create or replace function public.journal_entry_save(
  p_template_id uuid,
  p_student_id  uuid,
  p_entry_date  date default current_date,
  p_values      jsonb default '{}'::jsonb,  -- {fieldId: value}
  p_free_text   text default null,
  p_entry_id    uuid default null           -- set = EDIT own entry
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
  v_tmpl    public.journal_templates;
  v_field   public.journal_fields;
  v_id      uuid;
  v_key     text;
  v_val     jsonb;
  v_type    public.journal_field_type;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then raise exception 'SANTRI_BUKAN_BINAAN'; end if;

  select * into v_tmpl from public.journal_templates
  where id = p_template_id and tenant_id = v_profile.tenant_id and is_active;
  if v_tmpl is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if p_entry_date is null
     or p_entry_date > (current_date + interval '7 days')::date
     or p_entry_date < (current_date - interval '1 year')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;
  if p_free_text is not null and char_length(p_free_text) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object'
     or (select count(*) from jsonb_object_keys(p_values)) > 40 then
    raise exception 'NILAI_TIDAK_VALID';
  end if;

  -- Validate each provided value against its field definition.
  for v_key in select jsonb_object_keys(p_values) loop
    select * into v_field from public.journal_fields
    where id = v_key::uuid and template_id = v_tmpl.id and tenant_id = v_profile.tenant_id;
    if v_field is null then raise exception 'FIELD_TIDAK_VALID'; end if;
    v_val := p_values -> v_key;
    v_type := v_field.field_type;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      if v_field.required then raise exception 'WAJIB_DIISI'; end if;
      continue;
    end if;
    case v_type
      when 'TEXT', 'TEXTAREA' then
        if jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') = 0
           or char_length(v_val #>> '{}') > 500 then
          raise exception 'NILAI_TIDAK_VALID';
        end if;
      when 'NUMBER' then
        if jsonb_typeof(v_val) <> 'number' then raise exception 'NILAI_TIDAK_VALID'; end if;
      when 'CHECKBOX' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'NILAI_TIDAK_VALID'; end if;
      when 'DATE' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}')::date is null then raise exception 'NILAI_TIDAK_VALID'; end if;
      when 'SELECT' then
        if jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from jsonb_array_elements_text(v_field.options) o
          where o = v_val #>> '{}'
        ) then raise exception 'NILAI_TIDAK_VALID'; end if;
    end case;
  end loop;

  -- All REQUIRED fields present.
  for v_field in
    select * from public.journal_fields
    where template_id = v_tmpl.id and required
  loop
    if p_values -> v_field.id::text is null
       or jsonb_typeof(p_values -> v_field.id::text) = 'null' then
      raise exception 'WAJIB_DIISI';
    end if;
  end loop;

  if p_entry_id is not null then
    select id into v_id from public.journal_entries
    where id = p_entry_id and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id and deleted_at is null;
    if v_id is null then raise exception 'ENTRY_TIDAK_DITEMUKAN'; end if;

    update public.journal_entries set
      entry_date = p_entry_date,
      free_text  = p_free_text
    where id = v_id;
  else
    insert into public.journal_entries (
      tenant_id, template_id, student_id, teacher_id, created_by, entry_date, free_text
    ) values (
      v_profile.tenant_id, v_tmpl.id, p_student_id, v_teacher.id, auth.uid(),
      p_entry_date, p_free_text
    ) returning id into v_id;
  end if;

  delete from public.journal_values where entry_id = v_id;
  for v_key in select jsonb_object_keys(p_values) loop
    if jsonb_typeof(p_values -> v_key) = 'null' then continue; end if;
    select * into v_field from public.journal_fields where id = v_key::uuid;
    insert into public.journal_values (
      tenant_id, entry_id, field_id,
      value_text, value_number, value_bool, value_date, value_option
    ) values (
      v_profile.tenant_id, v_id, v_field.id,
      case v_field.field_type when 'TEXT' then p_values ->> v_key
                              when 'TEXTAREA' then p_values ->> v_key end,
      case v_field.field_type when 'NUMBER' then (p_values ->> v_key)::numeric end,
      case v_field.field_type when 'CHECKBOX' then (p_values ->> v_key)::boolean end,
      case v_field.field_type when 'DATE' then (p_values ->> v_key)::date end,
      case v_field.field_type when 'SELECT' then p_values ->> v_key end
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.journal_soft_delete(p_entry_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'USTADZ' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;

  update public.journal_entries set deleted_at = now(), deleted_by = auth.uid()
  where id = p_entry_id and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id and deleted_at is null;
  if not found then raise exception 'ENTRY_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- Templates for guru (active only) with field list.
create or replace function public.journal_teacher_templates()
returns table (
  id                   uuid,
  name                 text,
  description          text,
  show_in_achievement  boolean,
  fields               jsonb
)
language sql
security definer set search_path = public
as $$
  select
    jt.id, jt.name, jt.description, jt.show_in_achievement,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id, 'label', f.label, 'type', f.field_type::text,
          'required', f.required, 'options', f.options, 'sortOrder', f.sort_order
        ) order by f.sort_order
      )
      from public.journal_fields f where f.template_id = jt.id
    ), '[]'::jsonb)
  from public.journal_templates jt
  where jt.tenant_id = public.current_tenant_id()
    and jt.is_active
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
  order by jt.sort_order, jt.name;
$$;

-- Full template list for ADMIN settings.
create or replace function public.journal_admin_templates()
returns table (
  id                   uuid,
  name                 text,
  description          text,
  show_in_achievement  boolean,
  sort_order           integer,
  is_active            boolean,
  entry_count          bigint,
  fields               jsonb
)
language sql
security definer set search_path = public
as $$
  select
    jt.id, jt.name, jt.description, jt.show_in_achievement, jt.sort_order, jt.is_active,
    (select count(*) from public.journal_entries e
      where e.template_id = jt.id and e.deleted_at is null),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id, 'label', f.label, 'type', f.field_type::text,
          'required', f.required, 'options', f.options, 'sortOrder', f.sort_order
        ) order by f.sort_order
      )
      from public.journal_fields f where f.template_id = jt.id
    ), '[]'::jsonb)
  from public.journal_templates jt
  where jt.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
  order by jt.sort_order, jt.name;
$$;

-- Entries visible to this guru (list; filterable by template).
create or replace function public.journal_teacher_entries(p_template_id uuid default null)
returns table (
  id              uuid,
  template_id     uuid,
  template_name   text,
  student_id      uuid,
  student_name    text,
  student_code    text,
  entry_date      date,
  free_text       text,
  values_summary  jsonb,
  teacher_name    text,
  updated_at      timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    e.id, e.template_id, jt.name, e.student_id, s.full_name, s.business_code,
    e.entry_date, e.free_text,
    coalesce((
      select jsonb_object_agg(
        f.label,
        coalesce(v.value_text, v.value_number::text, v.value_bool::text, v.value_date::text, v.value_option)
      )
      from public.journal_values v
      join public.journal_fields f on f.id = v.field_id
      where v.entry_id = e.id
    ), '{}'::jsonb),
    t.full_name, e.updated_at
  from public.journal_entries e
  join public.journal_templates jt on jt.id = e.template_id
  join public.students s on s.id = e.student_id
  left join public.teachers t on t.id = e.teacher_id
  where e.tenant_id = public.current_tenant_id()
    and e.deleted_at is null
    and (p_template_id is null or e.template_id = p_template_id)
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and e.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    )
  order by e.entry_date desc, e.created_at desc
  limit 200;
$$;

-- Entry detail incl. values (edit form; rule #29).
create or replace function public.journal_entry_detail(p_entry_id uuid)
returns table (
  id             uuid,
  template_id    uuid,
  template_name  text,
  student_id     uuid,
  student_name   text,
  student_code   text,
  entry_date     date,
  free_text      text,
  values_json    jsonb,
  teacher_name   text
)
language sql
security definer set search_path = public
as $$
  select
    e.id, e.template_id, jt.name, e.student_id, s.full_name, s.business_code,
    e.entry_date, e.free_text,
    coalesce((
      select jsonb_object_agg(f.id::text,
        coalesce(v.value_text, v.value_number::text, v.value_bool::text, v.value_date::text, v.value_option))
      from public.journal_values v
      join public.journal_fields f on f.id = v.field_id
      where v.entry_id = e.id
    ), '{}'::jsonb),
    t.full_name
  from public.journal_entries e
  join public.journal_templates jt on jt.id = e.template_id
  join public.students s on s.id = e.student_id
  left join public.teachers t on t.id = e.teacher_id
  where e.id = p_entry_id
    and e.tenant_id = public.current_tenant_id()
    and e.deleted_at is null
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and e.teacher_id = (
      select t2.id from public.teachers t2
      where t2.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
        and t2.full_name ilike (select full_name from public.profiles where id = auth.uid())
      order by t2.created_at desc limit 1
    );
$$;

create or replace function public.journal_student_entries(
  p_student_id  uuid,
  p_template_id uuid default null
)
returns table (
  id             uuid,
  template_name  text,
  entry_date     date,
  free_text      text,
  values_summary jsonb,
  teacher_name   text
)
language sql
security definer set search_path = public
as $$
  select
    e.id, jt.name, e.entry_date, e.free_text,
    coalesce((
      select jsonb_object_agg(
        f.label,
        coalesce(v.value_text, v.value_number::text, v.value_bool::text, v.value_date::text, v.value_option)
      )
      from public.journal_values v
      join public.journal_fields f on f.id = v.field_id
      where v.entry_id = e.id
    ), '{}'::jsonb),
    t.full_name
  from public.journal_entries e
  join public.journal_templates jt on jt.id = e.template_id
  left join public.teachers t on t.id = e.teacher_id
  where e.student_id = p_student_id
    and e.tenant_id = public.current_tenant_id()
    and e.deleted_at is null
    and (p_template_id is null or e.template_id = p_template_id)
  order by e.entry_date desc, e.created_at desc
  limit 100;
$$;

-- ============================================================================
-- 7. RPC — DASHBOARD & STUDENT SUMMARY (rule #33/#34 — real data only)
-- ============================================================================
create or replace function public.v7_teacher_counts(p_teacher_id uuid)
returns table (section text, cnt bigint)
language sql
security definer set search_path = public
as $$
  with session_teacher as (
    select t.id from public.teachers t
    where t.id = p_teacher_id
      and t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
      and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
  )
  select * from (
    select 'TARGETS'::text as section,
           count(*)::bigint as cnt
    from public.targets tg, session_teacher st
    where tg.teacher_id = st.id and tg.deleted_at is null
      and tg.status in ('BELUM_MULAI', 'BERJALAN', 'TERLAMBAT')
    union all
    select 'TASKS'::text,
           count(*)::bigint
    from public.tasks k, session_teacher st
    where k.teacher_id = st.id and k.deleted_at is null
      and k.status in ('BELUM_DIKERJAKAN', 'DIKERJAKAN', 'DIKUMPULKAN', 'TERLAMBAT')
    union all
    select 'JOURNALS'::text,
           count(*)::bigint
    from public.journal_entries e, session_teacher st
    where e.teacher_id = st.id and e.deleted_at is null
      and e.entry_date >= (current_date - interval '30 days')::date
  ) u;
$$;

create or replace function public.v7_student_summary(p_student_id uuid)
returns table (
  active_targets integer,
  avg_progress   numeric,
  active_tasks   integer,
  journal_month  integer
)
language sql
security definer set search_path = public
as $$
  select
    (select count(*)::integer from public.targets tg
      where tg.student_id = p_student_id and tg.tenant_id = public.current_tenant_id()
        and tg.deleted_at is null
        and tg.status in ('BELUM_MULAI','BERJALAN','TERLAMBAT')),
    (select coalesce(round(avg(least(tg.current_value / tg.target_value, 1) * 100), 0), 0)
      from public.targets tg
      where tg.student_id = p_student_id and tg.tenant_id = public.current_tenant_id()
        and tg.deleted_at is null and tg.status in ('BELUM_MULAI','BERJALAN','TERLAMBAT')
        and tg.target_value > 0),
    (select count(*)::integer from public.tasks k
      where k.student_id = p_student_id and k.tenant_id = public.current_tenant_id()
        and k.deleted_at is null
        and k.status in ('BELUM_DIKERJAKAN','DIKERJAKAN','DIKUMPULKAN','TERLAMBAT')),
    (select count(*)::integer from public.journal_entries e
      where e.student_id = p_student_id and e.tenant_id = public.current_tenant_id()
        and e.deleted_at is null
        and e.entry_date >= date_trunc('month', current_date)::date)
$$;

-- ============================================================================
-- 8. KARTU PRESTASI TIMELINE V7 (rule #22, #31-#32, #60) — superset of V6.
--    TUGAS: only DINILAI (graded) tasks enter the card.
--    JURNAL: only entries of templates with show_in_achievement = true.
--    p_module accepts ALL | TAHFIDZ | TARTIL | SETORAN | HADITS | DOA |
--    TAJWID | TUGAS | JURNAL.
-- ============================================================================
create or replace function public.tahfidz_student_timeline(
  p_student_id uuid,
  p_module     text default 'ALL'
)
returns table (
  module      text,
  occurred_at timestamptz,
  title       text,
  subtitle    text,
  score_label text,
  score_value integer,
  score_mode  text,
  status      public.tahfidz_progress,
  teacher_name text,
  notes_json  jsonb,
  ref_id      uuid,
  change_kind text
)
language sql
security definer set search_path = public
as $$
  select * from (
    -- TARTIL (V4 branch — unchanged).
    select
      'TARTIL'::text as module,
      h.assessed_at as occurred_at,
      m.name as title,
      coalesce(h.pages_label, '') as subtitle,
      h.score_label,
      h.score_value,
      public.tahfidz_settings_mode(h.tenant_id)::text as score_mode,
      h.status,
      t.full_name as teacher_name,
      h.notes_snapshot as notes_json,
      h.assessment_id as ref_id,
      h.change_kind
    from public.tartil_assessment_history h
    join public.tartil_materials m on m.id = h.material_id
    left join public.teachers t on t.id = h.teacher_id
    where h.student_id = p_student_id
      and h.tenant_id = public.current_tenant_id()
      and h.change_kind in ('CREATE', 'UPDATE')

    union all

    -- TAHFIDZ (V3 branch — unchanged).
    select
      'TAHFIDZ'::text,
      th.created_at,
      coalesce(ts.name_override, gs.name, 'Surat'),
      ''::text,
      th.score_label,
      th.score_value,
      th.mode_at_entry::text,
      th.status,
      t2.full_name,
      jsonb_build_object('catatan', th.note),
      th.assessment_id,
      th.change_kind
    from public.tahfidz_assessment_history th
    join public.tahfidz_tenant_surahs ts on ts.id = th.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    left join public.teachers t2 on t2.id = th.teacher_id
    where th.student_id = p_student_id
      and th.tenant_id = public.current_tenant_id()
      and th.status = 'DINILAI'

    union all

    -- SETORAN (V5 branch — unchanged).
    select
      'SETORAN'::text,
      sh.created_at,
      sh.kind::text,
      coalesce(ts2.name_override, gs2.name, 'Surat')
        || coalesce(' — ' || sh.ayat_label, ''),
      sh.score_label,
      sh.score_value,
      public.tahfidz_settings_mode(sh.tenant_id)::text,
      case sh.result
        when 'DITUNDA' then 'BELUM'::public.tahfidz_progress
        else 'DINILAI'::public.tahfidz_progress
      end,
      t3.full_name,
      sh.notes_snapshot
        || jsonb_build_object('status', sh.result::text, 'catatan', sh.free_note),
      sh.submission_id,
      sh.change_kind
    from public.tahfidz_submission_history sh
    join public.tahfidz_tenant_surahs ts2 on ts2.id = sh.tenant_surah_id
    left join public.tahfidz_surahs gs2 on gs2.id = ts2.surah_id
    left join public.teachers t3 on t3.id = sh.teacher_id
    where sh.student_id = p_student_id
      and sh.tenant_id = public.current_tenant_id()
      and sh.change_kind in ('CREATE', 'UPDATE')

    union all

    -- HADITS / DOA / TAJWID (V6 branch — unchanged).
    select
      lh.module_type::text,
      lh.created_at,
      lh.material_title,
      ''::text,
      lh.score_label,
      lh.score_value,
      public.tahfidz_settings_mode(lh.tenant_id)::text,
      case lh.status
        when 'LULUS' then 'DINILAI'::public.tahfidz_progress
        when 'MENGUASAI' then 'DINILAI'::public.tahfidz_progress
        else 'DIPELAJARI'::public.tahfidz_progress
      end,
      t4.full_name,
      lh.notes_snapshot
        || jsonb_build_object('status', lh.status::text, 'catatan', lh.free_note),
      lh.assessment_id,
      lh.change_kind
    from public.learning_assessment_history lh
    left join public.teachers t4 on t4.id = lh.teacher_id
    where lh.student_id = p_student_id
      and lh.tenant_id = public.current_tenant_id()
      and lh.change_kind in ('CREATE', 'UPDATE')

    union all

    -- TUGAS (V7, rule #22: only graded tasks — no administrative noise).
    select
      'TUGAS'::text,
      kh.created_at,
      kh.title,
      kh.module_type::text,
      kh.score_label,
      kh.score_value,
      public.tahfidz_settings_mode(kh.tenant_id)::text,
      'DINILAI'::public.tahfidz_progress,
      t5.full_name,
      jsonb_build_object('catatan', kh.teacher_note, 'pengumpulan', kh.completion_note),
      kh.id,
      'CREATE'::text
    from public.tasks kh
    left join public.teachers t5 on t5.id = kh.teacher_id
    where kh.student_id = p_student_id
      and kh.tenant_id = public.current_tenant_id()
      and kh.status = 'DINILAI'
      and kh.deleted_at is null

    union all

    -- JURNAL (V7, rule #31: only templates flagged for the card).
    select
      'JURNAL'::text,
      jh.created_at,
      jh.template_name,
      jh.template_name,
      null::text,
      null::integer,
      'NONE'::text,
      'DINILAI'::public.tahfidz_progress,
      t6.full_name,
      jh.values_snapshot
        || jsonb_build_object('catatan', jh.free_text),
      jh.entry_id,
      jh.change_kind
    from public.journal_entry_history jh
    left join public.teachers t6 on t6.id = jh.teacher_id
    where jh.student_id = p_student_id
      and jh.tenant_id = public.current_tenant_id()
      and jh.show_in_achieve
      and jh.change_kind in ('CREATE', 'UPDATE')
  ) combined
  where (p_module = 'ALL' or module = p_module)
  order by occurred_at desc
  limit 200;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (rule #40-#42)
-- ============================================================================
alter table public.targets                 enable row level security;
alter table public.target_progress_history enable row level security;
alter table public.tasks                   enable row level security;
alter table public.task_status_history     enable row level security;
alter table public.journal_templates       enable row level security;
alter table public.journal_fields          enable row level security;
alter table public.journal_entries         enable row level security;
alter table public.journal_values          enable row level security;
alter table public.journal_entry_history   enable row level security;

-- Targets: guru sees own students; Admin/Koordinator read tenant-wide;
-- writes ONLY via RPCs.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists targets_select on public.targets;
create policy targets_select on public.targets
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.teacher_students ts
            join public.teachers t on t.id = ts.teacher_id
            where ts.student_id = targets.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists target_history_select on public.target_progress_history;
create policy target_history_select on public.target_progress_history
  for select to authenticated
  using (
    exists (
      select 1 from public.targets tg
      where tg.id = target_id
        and tg.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = tg.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.teacher_students ts
            join public.teachers t on t.id = ts.teacher_id
            where ts.student_id = tasks.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists task_history_select on public.task_status_history;
create policy task_history_select on public.task_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks k
      where k.id = task_id
        and k.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = k.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

-- Journal templates + fields: tenant members read; ADMIN writes (RPC only).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists journal_templates_select on public.journal_templates;
create policy journal_templates_select on public.journal_templates
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists journal_fields_select on public.journal_fields;
create policy journal_fields_select on public.journal_fields
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

-- Entries: guru → own students; Admin/Koordinator read tenant-wide.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.teacher_students ts
            join public.teachers t on t.id = ts.teacher_id
            where ts.student_id = journal_entries.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists journal_values_select on public.journal_values;
create policy journal_values_select on public.journal_values
  for select to authenticated
  using (
    exists (
      select 1 from public.journal_entries e
      where e.id = entry_id
        and e.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = e.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists journal_history_select on public.journal_entry_history;
create policy journal_history_select on public.journal_entry_history
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.teacher_students ts
            join public.teachers t on t.id = ts.teacher_id
            where ts.student_id = journal_entry_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );
