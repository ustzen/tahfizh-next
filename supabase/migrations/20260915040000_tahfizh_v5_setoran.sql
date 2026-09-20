-- ============================================================================
-- TAHFIZH V5 — MODUL SETORAN HAFALAN
-- New migration; does NOT alter V1–V4 tables destructively.
--
-- Adds:
--   * tahfidz_submission_templates  (per-tenant structured note templates,
--                                    5 slots — mirrors tartil_note_templates)
--   * tahfidz_submissions           (setoran rows; soft-delete safe; reuses
--                                    the V3 master surat + scoring config)
--   * tahfidz_submission_notes      (structured notes 1:N)
--   * tahfidz_submission_history    (append-only via trigger)
--   * RPCs: tahfidz_save_submission, tahfidz_soft_delete_submission,
--           tahfidz_teacher_submission_summaries,
--           tahfidz_student_submissions,
--           tahfidz_student_timeline (V5 — now includes SETORAN entries)
--   * Seed default submission note templates on tenant creation + backfill
--   * Full RLS (tenant isolation + guru-scoped rows)
--
-- Design notes:
--   * Rule #9: reuses V3 tenant surahs — NO second master surah.
--   * Rule #12: reuses the V3 scoring system (mode CENTANG/HURUF/ANGKA).
--   * Rule #13: status enum LULUS/PERLU_MENGULANG/DITUNDA (extensible).
--   * Rule #19/#20: Kartu Prestasi stays a view over module histories —
--     tahfidz_student_timeline (replaced, superset of V4) now also unions
--     tahfidz_submission_history. One input only; zero duplicate storage.
--   * Rule #21: passing submissions do NOT silently rewrite Tahfidz V3 data.
--     The connection is read-side (timeline/summaries); safe future hook.
--   * Rule #48: writes go through SECURITY DEFINER RPCs that re-verify
--     session/role/tenant/teacher/assignment; each call is one transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums (idempotent)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.submission_kind as enum ('HAFALAN_BARU', 'MUROJAAH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_result as enum ('LULUS', 'PERLU_MENGULANG', 'DITUNDA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_note_slot as enum (
    'APRESIASI', 'KELANCARAN', 'KESALAHAN', 'SARAN', 'CATATAN_ORANG_TUA'
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. TEMPLATE CATATAN SETORAN (per tenant; rule #15-#17)
--    Admin manages; guru may only read + apply (originals never changed).
-- ============================================================================
create table if not exists public.tahfidz_submission_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  slot       public.submission_note_slot not null,
  content    text not null check (char_length(content) between 1 and 300),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tahfidz_submission_templates_tenant_idx
  on public.tahfidz_submission_templates (tenant_id, slot, sort_order);

drop trigger if exists tahfidz_submission_templates_updated_at on public.tahfidz_submission_templates;
create trigger tahfidz_submission_templates_updated_at
  before update on public.tahfidz_submission_templates
  for each row execute function public.touch_updated_at();

-- Default templates for NEW tenants (configuration defaults, not demo rows).
create or replace function public.tahfidz_seed_submission_templates()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order) values
    (new.id, 'APRESIASI',          'Alhamdulillah, hafalan ananda sudah semakin lancar.', 1),
    (new.id, 'KELANCARAN',         'Sudah cukup lancar.',                                  2),
    (new.id, 'KESALAHAN',          'Masih terdapat beberapa kesalahan pada akhir ayat.',   3),
    (new.id, 'SARAN',              'Perbanyak murojaah sebelum setoran berikutnya.',       4),
    (new.id, 'CATATAN_ORANG_TUA',  'Mohon mendampingi murojaah di rumah.',                 5)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_submission_seed on public.tenants;
create trigger tenants_submission_seed
  after insert on public.tenants
  for each row execute function public.tahfidz_seed_submission_templates();

-- Backfill for tenants created BEFORE this migration (idempotent; rule #30).
-- V12 FIX: versi lama memanggil public.tahfidz_seed_submission_templates(<row
-- tenants>) padahal fungsi itu TRIGGER tanpa argumen → error 42883 saat
-- migration dijalankan di database yang sudah punya tenant.
-- Pola V12: isi default HANYA bila tenant belum punya satu pun (WHERE NOT
-- EXISTS) — rerun tidak pernah menduplikasi baris (tabel tanpa unique).
create or replace function public.tahfidz_backfill_submission_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.submission_note_slot, v.content, v.sort_order
  from (values
    ('APRESIASI',          'Alhamdulillah, hafalan ananda sudah semakin lancar.', 1),
    ('KELANCARAN',         'Sudah cukup lancar.',                                  2),
    ('KESALAHAN',          'Masih terdapat beberapa kesalahan pada akhir ayat.',   3),
    ('SARAN',              'Perbanyak murojaah sebelum setoran berikutnya.',       4),
    ('CATATAN_ORANG_TUA',  'Mohon mendampingi murojaah di rumah.',                 5)
  ) as v(slot, content, sort_order)
  where not exists (select 1 from public.tahfidz_submission_templates t where t.tenant_id = p_tenant);
end;
$$;

-- V12 (idempotent, per-tenant guard): satu tenant yang gagal seed default
-- TIDAK PERNAH menggagalkan seluruh migration/file gabungan — cukup warning,
-- rerun tetap aman.
do $$
declare
  v_tenant record;
begin
  for v_tenant in select id from public.tenants loop
    begin
      perform public.tahfidz_backfill_submission_defaults(v_tenant.id);
    exception when others then
      raise warning 'tahfidz_backfill_submission_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
    end;
  end loop;
end
$$;

-- ============================================================================
-- 2. SETORAN (rule #2, #5, #10, #13, #28)
--    * tenant_surah_id → V3 tahfidz_tenant_surahs (rule #9: one master).
--    * score_*        → V3 mode semantics (ANGKA 1-100 / HURUF grade / null).
--    * result         → LULUS / PERLU_MENGULANG / DITUNDA (rule #13).
--    * soft delete only (deleted_at) — history & Kartu Prestasi stay whole.
--    * assessed_date is the guru-chosen date (rule #8) — NOT a timestamp.
-- ============================================================================
create table if not exists public.tahfidz_submissions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  teacher_id     uuid references public.teachers (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  tenant_surah_id uuid not null references public.tahfidz_tenant_surahs (id) on delete restrict,
  kind           public.submission_kind not null default 'HAFALAN_BARU',
  ayat_label     text check (char_length(ayat_label) <= 60),   -- "1–6", "Ayat 1", "Awal surat"
  assessed_date  date not null default current_date,
  result         public.submission_result not null default 'LULUS',
  score_value    integer check (score_value between 1 and 100),
  score_label    text check (char_length(score_label) between 1 and 10),
  free_note      text check (char_length(free_note) <= 500),
  deleted_at     timestamptz,
  deleted_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tahfidz_submissions_tenant_idx
  on public.tahfidz_submissions (tenant_id, assessed_date desc, created_at desc);
create index if not exists tahfidz_submissions_student_idx
  on public.tahfidz_submissions (student_id, assessed_date desc, created_at desc);
create index if not exists tahfidz_submissions_teacher_idx
  on public.tahfidz_submissions (teacher_id);
create index if not exists tahfidz_submissions_surah_idx
  on public.tahfidz_submissions (tenant_surah_id);

drop trigger if exists tahfidz_submissions_updated_at on public.tahfidz_submissions;
create trigger tahfidz_submissions_updated_at
  before update on public.tahfidz_submissions
  for each row execute function public.touch_updated_at();

-- Structured notes (1:N): Apresiasi/Kelancaran/Kesalahan/Saran/Orang Tua.
create table if not exists public.tahfidz_submission_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null references public.tahfidz_submissions (id) on delete cascade,
  slot          public.submission_note_slot not null,
  content       text not null check (char_length(content) between 1 and 500),
  created_at    timestamptz not null default now(),
  unique (submission_id, slot)
);

create index if not exists tahfidz_submission_notes_idx
  on public.tahfidz_submission_notes (submission_id);

-- ============================================================================
-- 3. HISTORY — append-only snapshot (rule #2, #29: never overwrite)
-- ============================================================================
create table if not exists public.tahfidz_submission_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  submission_id  uuid not null references public.tahfidz_submissions (id) on delete cascade,
  student_id     uuid not null,
  teacher_id     uuid,
  created_by     uuid,
  tenant_surah_id uuid not null,
  kind           public.submission_kind not null,
  ayat_label     text,
  assessed_date  date not null,
  result         public.submission_result not null,
  score_value    integer,
  score_label    text,
  free_note      text,
  notes_snapshot jsonb not null default '{}'::jsonb,
  change_kind    text not null default 'CREATE',   -- CREATE | UPDATE | SOFT_DELETE
  created_at     timestamptz not null default now()
);

create index if not exists tahfidz_submission_history_student_idx
  on public.tahfidz_submission_history (student_id, created_at desc);
create index if not exists tahfidz_submission_history_submission_idx
  on public.tahfidz_submission_history (submission_id);

-- History trigger: snapshot row + structured notes on every write.
create or replace function public.tahfidz_record_submission_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_notes jsonb;
  v_kind  text;
begin
  select coalesce(jsonb_object_agg(slot, content), '{}'::jsonb)
    into v_notes
  from public.tahfidz_submission_notes
  where submission_id = new.id;

  if tg_op = 'INSERT' then
    v_kind := 'CREATE';
  else
    v_kind := case when new.deleted_at is null then 'UPDATE' else 'SOFT_DELETE' end;
  end if;

  insert into public.tahfidz_submission_history (
    tenant_id, submission_id, student_id, teacher_id, created_by,
    tenant_surah_id, kind, ayat_label, assessed_date, result,
    score_value, score_label, free_note, notes_snapshot, change_kind
  ) values (
    new.tenant_id, new.id, new.student_id, new.teacher_id, new.created_by,
    new.tenant_surah_id, new.kind, new.ayat_label, new.assessed_date, new.result,
    new.score_value, new.score_label, new.free_note, v_notes, v_kind
  );
  return new;
end;
$$;

drop trigger if exists tahfidz_submissions_history on public.tahfidz_submissions;
create trigger tahfidz_submissions_history
  after insert or update on public.tahfidz_submissions
  for each row execute function public.tahfidz_record_submission_history();

-- ============================================================================
-- 4. RPC — GURU SAVE (single transaction; rule #6-#12, #27, #47-#49)
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | SANTRI_BUKAN_BINAAN |
--            SANTRI_TIDAK_DITEMUKAN | SURAT_TIDAK_AKTIF | JENIS_TIDAK_VALID |
--            STATUS_TIDAK_VALID | TANGGAL_TIDAK_VALID | NILAI_ANGKA_TIDAK_VALID |
--            GRADE_TIDAK_VALID | CATATAN_* | SUBMISSION_TIDAK_DITEMUKAN
-- ============================================================================
create or replace function public.tahfidz_save_submission(
  p_student_id    uuid,
  p_tenant_surah_id uuid,
  p_kind          text default 'HAFALAN_BARU',
  p_ayat_label    text default null,
  p_assessed_date date default current_date,
  p_result        text default 'LULUS',
  p_score_value   integer default null,
  p_score_label   text default null,
  p_free_note     text default null,
  p_notes         jsonb default '{}'::jsonb,  -- {"APRESIASI":"…","SARAN":"…"}
  p_submission_id uuid default null           -- set = EDIT existing (rule #27)
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_teacher public.teachers;
  v_mode    public.tahfidz_mode;
  v_kind    public.submission_kind;
  v_result  public.submission_result;
  v_id      uuid;
  v_key     text;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Teacher identity from the SESSION, never from the client (rule #31, #54).
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id
      and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  -- Assignment check (rule #32/#54): cross-teacher / cross-tenant refused.
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then
    raise exception 'SANTRI_BUKAN_BINAAN';
  end if;

  if not exists (
    select 1 from public.students s
    where s.id = p_student_id and s.tenant_id = v_profile.tenant_id
  ) then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  -- Rule #9: the surah must be an ACTIVE V3 tenant surah of THIS tenant.
  if not exists (
    select 1 from public.tahfidz_tenant_surahs ts2
    where ts2.id = p_tenant_surah_id
      and ts2.tenant_id = v_profile.tenant_id
      and ts2.is_active
  ) then
    raise exception 'SURAT_TIDAK_AKTIF';
  end if;

  if p_kind not in ('HAFALAN_BARU', 'MUROJAAH') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  v_kind := p_kind::public.submission_kind;

  if p_result not in ('LULUS', 'PERLU_MENGULANG', 'DITUNDA') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_result := p_result::public.submission_result;

  -- Rule #8: valid calendar date; not more than 1 year in the past/future.
  if p_assessed_date is null
     or p_assessed_date > (current_date + interval '7 days')::date
     or p_assessed_date < (current_date - interval '1 year')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  -- Structured notes: ≤ 5 slots, valid enum keys, each 1..500 chars.
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    if (select count(*) from jsonb_object_keys(p_notes)) > 5 then
      raise exception 'CATATAN_TIDAK_VALID';
    end if;
    for v_key in select jsonb_object_keys(p_notes) loop
      -- Membership check (a plain cast would RAISE on unknown keys).
      if not exists (
        select 1 from unnest(enum_range(null::public.submission_note_slot)) e
        where e::text = v_key
      ) then
        raise exception 'CATATAN_TIDAK_VALID';
      end if;
      if coalesce(p_notes ->> v_key, '') = '' then
        raise exception 'CATATAN_TIDAK_VALID';
      end if;
      if char_length(p_notes ->> v_key) > 500 then
        raise exception 'CATATAN_TERLALU_PANJANG';
      end if;
    end loop;
  end if;

  -- Rule #12: scoring follows the V3 tenant config — no second system.
  v_mode := coalesce(public.tahfidz_settings_mode(v_profile.tenant_id), 'CENTANG');
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
  else
    p_score_value := null; -- CENTANG mode ignores numeric payloads
    p_score_label := null;
  end if;

  if p_free_note is not null and char_length(p_free_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;
  if p_ayat_label is not null and char_length(p_ayat_label) > 60 then
    raise exception 'AYAT_TERLALU_PANJANG';
  end if;

  if p_submission_id is not null then
    -- EDIT (rule #27): only the owning teacher of THIS tenant may edit.
    select id into v_id from public.tahfidz_submissions
    where id = p_submission_id
      and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id
      and deleted_at is null;
    if v_id is null then raise exception 'SUBMISSION_TIDAK_DITEMUKAN'; end if;

    update public.tahfidz_submissions set
      tenant_surah_id = p_tenant_surah_id,
      kind            = v_kind,
      ayat_label      = p_ayat_label,
      assessed_date   = p_assessed_date,
      result          = v_result,
      score_value     = p_score_value,
      score_label     = p_score_label,
      free_note       = p_free_note
    where id = v_id;
  else
    -- Rule #49: NO unique constraint on (student, surah, date) — multiple
    -- setoran per day are legitimate. Double-submit is prevented in the UI
    -- (disabled button) and by idempotent history rows instead.
    insert into public.tahfidz_submissions (
      tenant_id, student_id, teacher_id, created_by, tenant_surah_id,
      kind, ayat_label, assessed_date, result, score_value, score_label, free_note
    ) values (
      v_profile.tenant_id, p_student_id, v_teacher.id, v_uid, p_tenant_surah_id,
      v_kind, p_ayat_label, p_assessed_date, v_result, p_score_value, p_score_label, p_free_note
    )
    returning id into v_id;
  end if;

  -- Replace structured notes atomically with the row (same transaction).
  delete from public.tahfidz_submission_notes where submission_id = v_id;
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    insert into public.tahfidz_submission_notes (tenant_id, submission_id, slot, content)
    select v_profile.tenant_id, v_id, k::public.submission_note_slot, p_notes ->> k
    from jsonb_object_keys(p_notes) as k
    on conflict (submission_id, slot) do update set content = excluded.content;
  end if;

  return v_id;
end;
$$;

-- Soft delete (rule #28): hide from active views; history/Kartu Prestasi keep
-- the record with change_kind = SOFT_DELETE (nothing becomes orphaned).
create or replace function public.tahfidz_soft_delete_submission(p_submission_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher public.teachers;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and full_name ilike v_profile.full_name
    order by created_at desc limit 1;

  update public.tahfidz_submissions set
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_submission_id
    and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id
    and deleted_at is null;

  if not found then raise exception 'SUBMISSION_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- ============================================================================
-- 5. RPC — TEACHER SUBMISSION SUMMARIES (list page; rule #5, #38)
--    Per-student counts + latest setoran for santri binaan.
-- ============================================================================
create or replace function public.tahfidz_teacher_submission_summaries(p_teacher_id uuid)
returns table (
  student_id        uuid,
  business_code     text,
  full_name         text,
  gender            public.gender_type,
  student_status    public.entity_status,
  submission_count  bigint,
  lulus_count       bigint,
  last_surah        text,
  last_ayat         text,
  last_kind         public.submission_kind,
  last_result       public.submission_result,
  last_score_label  text,
  last_score_value  integer,
  last_date         date
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
  counts as (
    select
      sub.student_id,
      count(*) filter (where true)::bigint as submission_count,
      count(*) filter (where sub.result = 'LULUS')::bigint as lulus_count
    from public.tahfidz_submissions sub
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    group by sub.student_id
  ),
  latest as (
    select distinct on (sub.student_id)
      sub.student_id, sub.ayat_label, sub.kind, sub.result,
      sub.score_label, sub.score_value, sub.assessed_date,
      coalesce(ts.name_override, gs.name, 'Surat') as surah_name
    from public.tahfidz_submissions sub
    join public.tahfidz_tenant_surahs ts on ts.id = sub.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    order by sub.student_id, sub.assessed_date desc, sub.created_at desc
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(c.submission_count, 0),
    coalesce(c.lulus_count, 0),
    l.surah_name, l.ayat_label, l.kind, l.result, l.score_label, l.score_value, l.assessed_date
  from assigned a
  left join counts c on c.student_id = a.id
  left join latest l on l.student_id = a.id
  order by a.full_name;
$$;

-- ============================================================================
-- 6. RPC — STUDENT SUBMISSIONS (detail page; rule #23) — supports filters.
--    p_filter: ALL | HAFALAN_BARU | MUROJAAH | LULUS | PERLU_MENGULANG | DITUNDA
--    (search lives on the list page, client-side over assigned summaries).
-- ============================================================================
create or replace function public.tahfidz_student_submissions(
  p_student_id uuid,
  p_filter     text default 'ALL'
)
returns table (
  id            uuid,
  kind          public.submission_kind,
  ayat_label    text,
  assessed_date date,
  result        public.submission_result,
  score_value   integer,
  score_label   text,
  free_note     text,
  teacher_name  text,
  surah_name    text,
  notes         jsonb,
  updated_at    timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    sub.id,
    sub.kind,
    sub.ayat_label,
    sub.assessed_date,
    sub.result,
    sub.score_value,
    sub.score_label,
    sub.free_note,
    t.full_name,
    coalesce(ts.name_override, gs.name, 'Surat') as surah_name,
    coalesce((
      select jsonb_object_agg(n.slot, n.content)
      from public.tahfidz_submission_notes n where n.submission_id = sub.id
    ), '{}'::jsonb),
    sub.updated_at
  from public.tahfidz_submissions sub
  join public.tahfidz_tenant_surahs ts on ts.id = sub.tenant_surah_id
  left join public.tahfidz_surahs gs on gs.id = ts.surah_id
  left join public.teachers t on t.id = sub.teacher_id
  where sub.student_id = p_student_id
    and sub.tenant_id = public.current_tenant_id()
    and sub.deleted_at is null
    and (
      p_filter = 'ALL'
      or (p_filter in ('HAFALAN_BARU', 'MUROJAAH') and sub.kind::text = p_filter)
      or (p_filter in ('LULUS', 'PERLU_MENGULANG', 'DITUNDA') and sub.result::text = p_filter)
    )
  order by sub.assessed_date desc, sub.created_at desc
  limit 100;
$$;

-- ============================================================================
-- 7. RPC — KARTU PRESTASI TIMELINE V5 (rule #19-#21)
--    Replaces the V4 function with a SUPERSET: now also unions SETORAN
--    entries from submission history. Tartil/Tahfidz branches unchanged.
--    p_module: ALL | TAHFIDZ | TARTIL | SETORAN
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
    -- TARTIL entries (V4 branch — unchanged).
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

    -- TAHFIDZ entries (V3 branch — unchanged).
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

    -- SETORAN entries (V5, rule #19: automatic, no second input).
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
  ) combined
  where (p_module = 'ALL' or module = p_module)
  order by occurred_at desc
  limit 200;
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (rule #31, #53, #54)
-- ============================================================================
alter table public.tahfidz_submission_templates enable row level security;
alter table public.tahfidz_submissions          enable row level security;
alter table public.tahfidz_submission_notes     enable row level security;
alter table public.tahfidz_submission_history   enable row level security;

-- Templates: tenant members read; ADMIN of the tenant writes (rule #17).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_submission_templates_select on public.tahfidz_submission_templates;
drop policy if exists tahfidz_submission_templates_admin_write on public.tahfidz_submission_templates;
create policy tahfidz_submission_templates_select on public.tahfidz_submission_templates
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tahfidz_submission_templates_admin_write on public.tahfidz_submission_templates
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Submissions: guru sees own students; Admin/Koordinator read tenant-wide
-- (future supervisi, rule #34); wali none in V5. Writes ONLY via RPCs.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_submissions_select on public.tahfidz_submissions;
create policy tahfidz_submissions_select on public.tahfidz_submissions
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
            where ts.student_id = tahfidz_submissions.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_submission_notes_select on public.tahfidz_submission_notes;
create policy tahfidz_submission_notes_select on public.tahfidz_submission_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.tahfidz_submissions s
      where s.id = submission_id
        and s.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = s.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tahfidz_submission_history_select on public.tahfidz_submission_history;
create policy tahfidz_submission_history_select on public.tahfidz_submission_history
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
            where ts.student_id = tahfidz_submission_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- ============================================================================
-- 9. KARTU PRESTASI convenience view extended with SETORAN (read-side only)
-- ============================================================================
create or replace view public.achievement_card_setoran
with (security_invoker = on) as  -- RLS of underlying tables applies (no bypass)
  select
    h.tenant_id, h.student_id, h.submission_id as ref_id,
    h.assessed_date::timestamptz as occurred_at,
    h.kind::text as kind,
    coalesce(ts.name_override, gs.name, 'Surat') as surah_name,
    h.ayat_label, h.result::text as result,
    h.score_label, h.score_value, h.notes_snapshot,
    t.full_name as teacher_name
  from public.tahfidz_submission_history h
  join public.tahfidz_tenant_surahs ts on ts.id = h.tenant_surah_id
  left join public.tahfidz_surahs gs on gs.id = ts.surah_id
  left join public.teachers t on t.id = h.teacher_id
  where h.change_kind in ('CREATE', 'UPDATE');
