-- ============================================================================
-- TAHFIZH V6 — MODUL HADITS, DOA HARIAN & TAJWID
-- New migration; does NOT alter V1–V5 tables destructively.
--
-- Design (rule #49): three material tables (different fields per module) +
-- ONE unified assessment engine:
--   * learning_materials_*      hadith_materials / daily_prayer_materials /
--                              tajwid_materials  (per-tenant master, admin CRUD)
--   * learning_note_templates  REUSABLE template engine (rule #20) with
--                              module_type — covers HADITS/DOA/TAJWID
--   * learning_assessments     one table, module_type enum + per-module FK
--                              guarded by a CHECK (exactly one material set)
--   * learning_assessment_notes / learning_assessment_history (append-only)
--
--   * RPCs: learning_save_assessment, learning_soft_delete_assessment,
--           learning_teacher_summaries, learning_student_assessments,
--           learning_module_counts, learning_teacher_today,
--           tahfidz_student_timeline (V6 superset — + HADITS/DOA/TAJWID)
--   * Reuses V3 scoring (CENTANG/HURUF/ANGKA) — no second system (rule #8/#14)
--   * Reuses global IDs (T-*/A-*/S-*) — no new ID scheme (rule #35)
--   * Full RLS (rule #32/#33): tenant isolation + guru-scoped reads,
--     writes only via SECURITY DEFINER RPCs (rule #34, #50)
--   * No unique(student,material,date) — multiple sessions per day are
--     legitimate (rule #51); double-submit guarded in the UI
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums (idempotent)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.learning_module as enum ('HADITS', 'DOA', 'TAJWID');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.learning_status as enum (
    'LULUS', 'PERLU_MENGULANG', 'BELUM_SELESAI',           -- Hadits & Doa (rule #9)
    'MENGUASAI', 'PERLU_LATIHAN', 'BELUM_MENGUASAI'        -- Tajwid (rule #18)
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. MASTER MATERI (per tenant; rule #4-#6, #11-#12, #15-#16)
--    Titles required; everything else optional per lembaga needs.
-- ============================================================================
create table if not exists public.hadith_materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 160),
  arabic_text  text check (char_length(arabic_text) <= 2000),
  translation  text check (char_length(translation) <= 1000),
  source_ref   text check (char_length(source_ref) <= 200),   -- riwayat/kitab/nomor
  description  text check (char_length(description) <= 500),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, title)
);

create table if not exists public.daily_prayer_materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 160),
  arabic_text  text check (char_length(arabic_text) <= 2000),
  latin_text   text check (char_length(latin_text) <= 2000),  -- transliterasi
  translation  text check (char_length(translation) <= 1000),
  description  text check (char_length(description) <= 500),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, title)
);

create table if not exists public.tajwid_materials (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  created_by      uuid references public.profiles (id) on delete set null,
  title           text not null check (char_length(title) between 1 and 160),
  category        text check (char_length(category) <= 80),
  explanation     text check (char_length(explanation) <= 2000),
  arabic_example  text check (char_length(arabic_example) <= 2000),
  reading_example text check (char_length(reading_example) <= 500),
  description     text check (char_length(description) <= 500),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, title)
);

create index if not exists hadith_materials_tenant_idx
  on public.hadith_materials (tenant_id, is_active, sort_order);
create index if not exists daily_prayer_materials_tenant_idx
  on public.daily_prayer_materials (tenant_id, is_active, sort_order);
create index if not exists tajwid_materials_tenant_idx
  on public.tajwid_materials (tenant_id, is_active, sort_order);

drop trigger if exists hadith_materials_updated_at on public.hadith_materials;
create trigger hadith_materials_updated_at
  before update on public.hadith_materials
  for each row execute function public.touch_updated_at();
drop trigger if exists daily_prayer_materials_updated_at on public.daily_prayer_materials;
create trigger daily_prayer_materials_updated_at
  before update on public.daily_prayer_materials
  for each row execute function public.touch_updated_at();
drop trigger if exists tajwid_materials_updated_at on public.tajwid_materials;
create trigger tajwid_materials_updated_at
  before update on public.tajwid_materials
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2. TEMPLATE CATATAN — REUSABLE ENGINE (rule #10, #19, #20)
--    One table for HADITS/DOA/TAJWID (module_type). slot is per-module text
--    (validated in the RPC) since sections differ per module.
-- ============================================================================
create table if not exists public.learning_note_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  module_type public.learning_module not null,
  slot        text not null check (char_length(slot) between 1 and 40),
  content     text not null check (char_length(content) between 1 and 300),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, module_type, slot, content)
);

create index if not exists learning_note_templates_tenant_idx
  on public.learning_note_templates (tenant_id, module_type, sort_order);

drop trigger if exists learning_note_templates_updated_at on public.learning_note_templates;
create trigger learning_note_templates_updated_at
  before update on public.learning_note_templates
  for each row execute function public.touch_updated_at();

create or replace function public.learning_seed_note_templates()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- HADITS (rule #10)
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order) values
    (new.id, 'HADITS', 'APRESIASI', 'Alhamdulillah, hafalan hadits ananda semakin baik.', 1),
    (new.id, 'HADITS', 'HAFALAN', 'Sudah menghafal lafaz hadits dengan lancar.', 2),
    (new.id, 'HADITS', 'BACAAN', 'Bacaan hadits perlu diperbaiki pada lafaz tertentu.', 3),
    (new.id, 'HADITS', 'SARAN', 'Perbanyak murojaah lafaz hadits.', 4),
    (new.id, 'HADITS', 'CATATAN_ORANG_TUA', 'Mohon didampingi mengulang hafalan hadits di rumah.', 5),
  -- DOA HARIAN
    (new.id, 'DOA', 'APRESIASI', 'Alhamdulillah, ananda semakin rajin mengamalkan doa.', 1),
    (new.id, 'DOA', 'HAFALAN', 'Hafalan doa sudah lancar.', 2),
    (new.id, 'DOA', 'PELAFALAN', 'Pelafalan bacaan doa perlu diperbaiki.', 3),
    (new.id, 'DOA', 'PENGAMALAN', 'Terbiasa mengamalkan doa dalam keseharian.', 4),
    (new.id, 'DOA', 'CATATAN_ORANG_TUA', 'Mohon mengingatkan ananda mengamalkan doa di rumah.', 5),
  -- TAJWID (rule #19)
    (new.id, 'TAJWID', 'PEMAHAMAN', 'Sudah memahami kaidah tajwid ini.', 1),
    (new.id, 'TAJWID', 'PENERAPAN', 'Perlu latihan penerapan saat membaca Al-Qur''an.', 2),
    (new.id, 'TAJWID', 'KESALAHAN', 'Masih terdapat kesalahan pada penerapan kaidah.', 3),
    (new.id, 'TAJWID', 'SARAN', 'Perbanyak latihan membaca dengan memperhatikan kaidah.', 4),
    (new.id, 'TAJWID', 'CATATAN_ORANG_TUA', 'Mohon mendampingi latihan membaca Al-Qur''an di rumah.', 5)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_learning_seed on public.tenants;
create trigger tenants_learning_seed
  after insert on public.tenants
  for each row execute function public.learning_seed_note_templates();

create or replace function public.learning_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- V12 FIX: versi lama memanggil public.learning_seed_note_templates(<row
  -- tenants>) padahal fungsi itu TRIGGER tanpa argumen → error 42883 saat
  -- migration dijalankan di database yang sudah punya tenant.
  -- Pola V12: isi default HANYA bila tenant belum punya satu pun (WHERE NOT
  -- EXISTS) — rerun tidak pernah menduplikasi baris.
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order)
  select p_tenant, v.module_type::public.learning_module, v.slot, v.content, v.sort_order
  from (values
    ('HADITS', 'APRESIASI', 'Alhamdulillah, hafalan hadits ananda semakin baik.', 1),
    ('HADITS', 'HAFALAN', 'Sudah menghafal lafaz hadits dengan lancar.', 2),
    ('HADITS', 'BACAAN', 'Bacaan hadits perlu diperbaiki pada lafaz tertentu.', 3),
    ('HADITS', 'SARAN', 'Perbanyak murojaah lafaz hadits.', 4),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon didampingi mengulang hafalan hadits di rumah.', 5),
    ('DOA', 'APRESIASI', 'Alhamdulillah, ananda semakin rajin mengamalkan doa.', 1),
    ('DOA', 'HAFALAN', 'Hafalan doa sudah lancar.', 2),
    ('DOA', 'PELAFALAN', 'Pelafalan bacaan doa perlu diperbaiki.', 3),
    ('DOA', 'PENGAMALAN', 'Terbiasa mengamalkan doa dalam keseharian.', 4),
    ('DOA', 'CATATAN_ORANG_TUA', 'Mohon mengingatkan ananda mengamalkan doa di rumah.', 5),
    ('TAJWID', 'PEMAHAMAN', 'Sudah memahami kaidah tajwid ini.', 1),
    ('TAJWID', 'PENERAPAN', 'Perlu latihan penerapan saat membaca Al-Qur''an.', 2),
    ('TAJWID', 'KESALAHAN', 'Masih terdapat kesalahan pada penerapan kaidah.', 3),
    ('TAJWID', 'SARAN', 'Perbanyak latihan membaca dengan memperhatikan kaidah.', 4),
    ('TAJWID', 'CATATAN_ORANG_TUA', 'Mohon mendampingi latihan membaca Al-Qur''an di rumah.', 5)
  ) as v(module_type, slot, content, sort_order)
  where not exists (select 1 from public.learning_note_templates t where t.tenant_id = p_tenant);
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
      perform public.learning_backfill_defaults(v_tenant.id);
    exception when others then
      raise warning 'learning_backfill_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
    end;
  end loop;
end
$$;

-- ============================================================================
-- 3. LEARNING ASSESSMENTS (rule #7, #13, #17-#18, #48, #51)
--    One engine for the three modules. Exactly-one-material CHECK keeps
--    referential integrity real (no polymorphic guessing).
-- ============================================================================
create table if not exists public.learning_assessments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  teacher_id     uuid references public.teachers (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  module_type    public.learning_module not null,
  hadith_id      uuid references public.hadith_materials (id) on delete restrict,
  prayer_id      uuid references public.daily_prayer_materials (id) on delete restrict,
  tajwid_id      uuid references public.tajwid_materials (id) on delete restrict,
  assessed_date  date not null default current_date,
  status         public.learning_status not null default 'LULUS',
  score_value    integer check (score_value between 1 and 100),
  score_label    text check (char_length(score_label) between 1 and 10),
  free_note      text check (char_length(free_note) <= 500),
  deleted_at     timestamptz,
  deleted_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint learning_assessments_material_check check (
    (module_type = 'HADITS' and hadith_id is not null and prayer_id is null and tajwid_id is null)
    or
    (module_type = 'DOA'    and hadith_id is null and prayer_id is not null and tajwid_id is null)
    or
    (module_type = 'TAJWID' and hadith_id is null and prayer_id is null and tajwid_id is not null)
  )
);

create index if not exists learning_assessments_tenant_idx
  on public.learning_assessments (tenant_id, module_type, assessed_date desc);
create index if not exists learning_assessments_student_idx
  on public.learning_assessments (student_id, module_type, assessed_date desc);
create index if not exists learning_assessments_teacher_idx
  on public.learning_assessments (teacher_id);
create index if not exists learning_assessments_hadith_idx on public.learning_assessments (hadith_id);
create index if not exists learning_assessments_prayer_idx on public.learning_assessments (prayer_id);
create index if not exists learning_assessments_tajwid_idx on public.learning_assessments (tajwid_id);

drop trigger if exists learning_assessments_updated_at on public.learning_assessments;
create trigger learning_assessments_updated_at
  before update on public.learning_assessments
  for each row execute function public.touch_updated_at();

-- Structured notes 1:N (slot = per-module text; validated in the RPC).
create table if not exists public.learning_assessment_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  assessment_id uuid not null references public.learning_assessments (id) on delete cascade,
  slot          text not null check (char_length(slot) between 1 and 40),
  content       text not null check (char_length(content) between 1 and 500),
  created_at    timestamptz not null default now(),
  unique (assessment_id, slot)
);

create index if not exists learning_assessment_notes_idx
  on public.learning_assessment_notes (assessment_id);

-- ============================================================================
-- 4. HISTORY — append-only snapshot (rule #2 pattern; #47 audit fields)
--    material_title is snapshotted so renames/deactivation never corrupt
--    histori lama (rule #48).
-- ============================================================================
create table if not exists public.learning_assessment_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  assessment_id  uuid not null references public.learning_assessments (id) on delete cascade,
  student_id     uuid not null,
  teacher_id     uuid,
  created_by     uuid,
  module_type    public.learning_module not null,
  material_id    uuid not null,
  material_title text not null,
  assessed_date  date not null,
  status         public.learning_status not null,
  score_value    integer,
  score_label    text,
  free_note      text,
  notes_snapshot jsonb not null default '{}'::jsonb,
  change_kind    text not null default 'CREATE',   -- CREATE | UPDATE | SOFT_DELETE
  created_at     timestamptz not null default now()
);

create index if not exists learning_history_student_idx
  on public.learning_assessment_history (student_id, module_type, created_at desc);
create index if not exists learning_history_assessment_idx
  on public.learning_assessment_history (assessment_id);

create or replace function public.learning_record_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_notes    jsonb;
  v_kind     text;
  v_title    text;
begin
  select coalesce(jsonb_object_agg(slot, content), '{}'::jsonb)
    into v_notes
  from public.learning_assessment_notes
  where assessment_id = new.id;

  v_title := case new.module_type
    when 'HADITS' then (select title from public.hadith_materials where id = new.hadith_id)
    when 'DOA'    then (select title from public.daily_prayer_materials where id = new.prayer_id)
    else               (select title from public.tajwid_materials where id = new.tajwid_id)
  end;

  if tg_op = 'INSERT' then
    v_kind := 'CREATE';
  else
    v_kind := case when new.deleted_at is null then 'UPDATE' else 'SOFT_DELETE' end;
  end if;

  insert into public.learning_assessment_history (
    tenant_id, assessment_id, student_id, teacher_id, created_by,
    module_type, material_id, material_title, assessed_date, status,
    score_value, score_label, free_note, notes_snapshot, change_kind
  ) values (
    new.tenant_id, new.id, new.student_id, new.teacher_id, new.created_by,
    new.module_type, coalesce(new.hadith_id, new.prayer_id, new.tajwid_id), v_title,
    new.assessed_date, new.status, new.score_value, new.score_label, new.free_note,
    v_notes, v_kind
  );
  return new;
end;
$$;

drop trigger if exists learning_assessments_history on public.learning_assessments;
create trigger learning_assessments_history
  after insert or update on public.learning_assessments
  for each row execute function public.learning_record_history();

-- Helper for the admin UI: material ids that already have history in a
-- module (rule #48 — those must not be hard-deleted).
create or replace function public.learning_used_material_ids(p_module text)
returns table (material_id uuid)
language sql
security definer set search_path = public
as $$
  select distinct coalesce(hadith_id, prayer_id, tajwid_id)
  from public.learning_assessments
  where tenant_id = public.current_tenant_id()
    and module_type = p_module::public.learning_module
    and coalesce(hadith_id, prayer_id, tajwid_id) is not null;
$$;

-- ============================================================================
-- 5. RPC — GURU SAVE (single transaction; rule #7, #34, #44, #50)
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | SANTRI_BUKAN_BINAAN |
--            SANTRI_TIDAK_DITEMUKAN | MATERI_TIDAK_AKTIF | MODUL_TIDAK_VALID |
--            STATUS_TIDAK_VALID | TANGGAL_TIDAK_VALID | NILAI_ANGKA_TIDAK_VALID |
--            GRADE_TIDAK_VALID | CATATAN_* | ASSESSMENT_TIDAK_DITEMUKAN
-- ============================================================================
create or replace function public.learning_save_assessment(
  p_student_id    uuid,
  p_module        text,                       -- HADITS | DOA | TAJWID
  p_material_id   uuid,
  p_assessed_date date default current_date,
  p_status        text default 'LULUS',
  p_score_value   integer default null,
  p_score_label   text default null,
  p_free_note     text default null,
  p_notes         jsonb default '{}'::jsonb,
  p_assessment_id uuid default null           -- set = EDIT own record (rule #27 V5 pattern)
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_teacher  public.teachers;
  v_mode     public.tahfidz_mode;
  v_module   public.learning_module;
  v_status   public.learning_status;
  v_id       uuid;
  v_key      text;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id
      and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

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

  if p_module not in ('HADITS', 'DOA', 'TAJWID') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;
  v_module := p_module::public.learning_module;

  -- Material must be an ACTIVE row of THIS tenant in the right module table.
  if v_module = 'HADITS' and not exists (
    select 1 from public.hadith_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  if v_module = 'DOA' and not exists (
    select 1 from public.daily_prayer_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  if v_module = 'TAJWID' and not exists (
    select 1 from public.tajwid_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  -- Status per module (rule #9/#18): Hadits/Doa vs Tajwid vocabularies.
  if p_status not in ('LULUS', 'PERLU_MENGULANG', 'BELUM_SELESAI',
                      'MENGUASAI', 'PERLU_LATIHAN', 'BELUM_MENGUASAI') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_status := p_status::public.learning_status;
  if (v_module in ('HADITS', 'DOA') and v_status in ('MENGUASAI', 'PERLU_LATIHAN', 'BELUM_MENGUASAI'))
     or (v_module = 'TAJWID' and v_status in ('LULUS', 'PERLU_MENGULANG', 'BELUM_SELESAI')) then
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  if p_assessed_date is null
     or p_assessed_date > (current_date + interval '7 days')::date
     or p_assessed_date < (current_date - interval '1 year')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  -- Structured notes: ≤ 5 slots, per-module slot vocabulary, each 1..500 chars.
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    if (select count(*) from jsonb_object_keys(p_notes)) > 5 then
      raise exception 'CATATAN_TIDAK_VALID';
    end if;
    for v_key in select jsonb_object_keys(p_notes) loop
      if not exists (
        select 1 from unnest(case v_module
          when 'HADITS' then array['APRESIASI','HAFALAN','BACAAN','SARAN','CATATAN_ORANG_TUA']
          when 'DOA'    then array['APRESIASI','HAFALAN','PELAFALAN','PENGAMALAN','CATATAN_ORANG_TUA']
          else               array['PEMAHAMAN','PENERAPAN','KESALAHAN','SARAN','CATATAN_ORANG_TUA']
        end) e
        where e = v_key
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

  -- V3 scoring engine (rule #8/#14) — exactly one source of truth.
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
    p_score_value := null;
    p_score_label := null;
  end if;

  if p_free_note is not null and char_length(p_free_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  if p_assessment_id is not null then
    -- EDIT: only the owning teacher of this tenant (record ownership, rule #34).
    select id into v_id from public.learning_assessments
    where id = p_assessment_id
      and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id
      and deleted_at is null;
    if v_id is null then raise exception 'ASSESSMENT_TIDAK_DITEMUKAN'; end if;

    update public.learning_assessments set
      module_type   = v_module,
      hadith_id     = case when v_module = 'HADITS' then p_material_id else null end,
      prayer_id     = case when v_module = 'DOA'    then p_material_id else null end,
      tajwid_id     = case when v_module = 'TAJWID' then p_material_id else null end,
      assessed_date = p_assessed_date,
      status        = v_status,
      score_value   = p_score_value,
      score_label   = p_score_label,
      free_note     = p_free_note
    where id = v_id;
  else
    -- Rule #51: no unique(student, material, date) — repeat sessions are legit.
    insert into public.learning_assessments (
      tenant_id, student_id, teacher_id, created_by, module_type,
      hadith_id, prayer_id, tajwid_id, assessed_date, status,
      score_value, score_label, free_note
    ) values (
      v_profile.tenant_id, p_student_id, v_teacher.id, v_uid, v_module,
      case when v_module = 'HADITS' then p_material_id end,
      case when v_module = 'DOA'    then p_material_id end,
      case when v_module = 'TAJWID' then p_material_id end,
      p_assessed_date, v_status, p_score_value, p_score_label, p_free_note
    )
    returning id into v_id;
  end if;

  delete from public.learning_assessment_notes where assessment_id = v_id;
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    insert into public.learning_assessment_notes (tenant_id, assessment_id, slot, content)
    select v_profile.tenant_id, v_id, k, p_notes ->> k
    from jsonb_object_keys(p_notes) as k
    on conflict (assessment_id, slot) do update set content = excluded.content;
  end if;

  return v_id;
end;
$$;

create or replace function public.learning_soft_delete_assessment(p_assessment_id uuid)
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

  update public.learning_assessments set
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_assessment_id
    and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id
    and deleted_at is null;

  if not found then raise exception 'ASSESSMENT_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- ============================================================================
-- 6. RPC — TEACHER SUMMARIES per module (list pages; rule #38/#39)
-- ============================================================================
create or replace function public.learning_teacher_summaries(
  p_teacher_id uuid,
  p_module     text
)
returns table (
  student_id      uuid,
  business_code   text,
  full_name       text,
  gender          public.gender_type,
  student_status  public.entity_status,
  assessed_count  bigint,
  lulus_count     bigint,
  last_material   text,
  last_status     public.learning_status,
  last_score_label text,
  last_score_value integer,
  last_date       date
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
      a.student_id,
      count(*) filter (where true)::bigint as assessed_count,
      count(*) filter (where a.status in ('LULUS', 'MENGUASAI'))::bigint as lulus_count
    from public.learning_assessments a
    where a.student_id in (select id from assigned)
      and a.module_type = p_module::public.learning_module
      and a.deleted_at is null
    group by a.student_id
  ),
  latest as (
    select distinct on (a.student_id)
      a.student_id, h.material_title, a.status, a.score_label, a.score_value, a.assessed_date
    from public.learning_assessments a
    join public.learning_assessment_history h
      on h.assessment_id = a.id and h.change_kind in ('CREATE', 'UPDATE')
    where a.student_id in (select id from assigned)
      and a.module_type = p_module::public.learning_module
      and a.deleted_at is null
    order by a.student_id, a.assessed_date desc, a.created_at desc
  )
  select
    s.id, s.business_code, s.full_name, s.gender, s.status,
    coalesce(c.assessed_count, 0),
    coalesce(c.lulus_count, 0),
    l.material_title, l.status, l.score_label, l.score_value, l.assessed_date
  from assigned s
  left join counts c on c.student_id = s.id
  left join latest l on l.student_id = s.id
  order by s.full_name;
$$;

-- ============================================================================
-- 7. RPC — STUDENT ASSESSMENTS per module (detail + histori; rule #25/#45)
--    p_filter: ALL | <status enum values>
-- ============================================================================
create or replace function public.learning_student_assessments(
  p_student_id uuid,
  p_module     text,
  p_filter     text default 'ALL'
)
returns table (
  id            uuid,
  material_title text,
  assessed_date date,
  status        public.learning_status,
  score_value   integer,
  score_label   text,
  free_note     text,
  teacher_name  text,
  notes         jsonb,
  updated_at    timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    a.id,
    coalesce(
      (select title from public.hadith_materials m where m.id = a.hadith_id),
      (select title from public.daily_prayer_materials m where m.id = a.prayer_id),
      (select title from public.tajwid_materials m where m.id = a.tajwid_id),
      'Materi'
    ) as material_title,
    a.assessed_date,
    a.status,
    a.score_value,
    a.score_label,
    a.free_note,
    t.full_name,
    coalesce((
      select jsonb_object_agg(n.slot, n.content)
      from public.learning_assessment_notes n where n.assessment_id = a.id
    ), '{}'::jsonb),
    a.updated_at
  from public.learning_assessments a
  left join public.teachers t on t.id = a.teacher_id
  where a.student_id = p_student_id
    and a.tenant_id = public.current_tenant_id()
    and a.module_type = p_module::public.learning_module
    and a.deleted_at is null
    and (p_filter = 'ALL' or a.status::text = p_filter)
  order by a.assessed_date desc, a.created_at desc
  limit 100;
$$;

-- ============================================================================
-- 8. RPC — MODULE COUNTS for a student (Perkembangan Pembelajaran; rule #26)
-- ============================================================================
create or replace function public.learning_module_counts(p_student_id uuid)
returns table (
  module         text,
  material_count bigint,
  assessment_count bigint
)
language sql
security definer set search_path = public
as $$
  select
    a.module_type::text,
    count(distinct coalesce(a.hadith_id, a.prayer_id, a.tajwid_id))::bigint,
    count(*)::bigint
  from public.learning_assessments a
  where a.student_id = p_student_id
    and a.tenant_id = public.current_tenant_id()
    and a.deleted_at is null
  group by a.module_type;
$$;

-- ============================================================================
-- 9. RPC — TEACHER TODAY ACTIVITY (dashboard; rule #27) — 5 modules incl.
--    Setoran (V5) & Tartil (V4), verified against the session teacher.
-- ============================================================================
create or replace function public.learning_teacher_today(p_teacher_id uuid)
returns table (module text, today_count bigint)
language sql
security definer set search_path = public
as $$
  with session_teacher as (
    select t.id from public.teachers t
    where t.id = p_teacher_id
      and t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
      and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
  ),
  setoran_today as (
    select 'SETORAN'::text as module, count(*)::bigint as c
    from public.tahfidz_submissions sub, session_teacher st
    where sub.teacher_id = st.id and sub.deleted_at is null
      and sub.assessed_date = current_date
  ),
  tartil_today as (
    select 'TARTIL'::text as module, count(*)::bigint as c
    from public.tartil_assessments a, session_teacher st
    where a.teacher_id = st.id and a.deleted_at is null
      and a.assessed_at::date = current_date
  ),
  hadits_today as (
    select 'HADITS'::text as module, count(*)::bigint as c
    from public.learning_assessments a, session_teacher st
    where a.teacher_id = st.id and a.deleted_at is null
      and a.module_type = 'HADITS' and a.assessed_date = current_date
  ),
  doa_today as (
    select 'DOA'::text as module, count(*)::bigint as c
    from public.learning_assessments a, session_teacher st
    where a.teacher_id = st.id and a.deleted_at is null
      and a.module_type = 'DOA' and a.assessed_date = current_date
  ),
  tajwid_today as (
    select 'TAJWID'::text as module, count(*)::bigint as c
    from public.learning_assessments a, session_teacher st
    where a.teacher_id = st.id and a.deleted_at is null
      and a.module_type = 'TAJWID' and a.assessed_date = current_date
  )
  select module, c as today_count from (
    select * from setoran_today union all
    select * from tartil_today union all
    select * from hadits_today union all
    select * from doa_today union all
    select * from tajwid_today
  ) u
  where c > 0
  order by c desc;
$$;

-- ============================================================================
-- 10. KARTU PRESTASI TIMELINE V6 (rule #21-#24) — superset of V5: now also
--     unions HADITS / DOA / TAJWID from learning history. p_module accepts
--     ALL | TAHFIDZ | TARTIL | SETORAN | HADITS | DOA | TAJWID.
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

    -- HADITS / DOA / TAJWID (V6, rule #21-#22: automatic, one input only).
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
  ) combined
  where (p_module = 'ALL' or module = p_module)
  order by occurred_at desc
  limit 200;
$$;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (rule #32-#34)
-- ============================================================================
alter table public.hadith_materials        enable row level security;
alter table public.daily_prayer_materials  enable row level security;
alter table public.tajwid_materials        enable row level security;
alter table public.learning_note_templates enable row level security;
alter table public.learning_assessments    enable row level security;
alter table public.learning_assessment_notes enable row level security;
alter table public.learning_assessment_history enable row level security;

-- Materials + templates: tenant members read; ADMIN of the tenant writes.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists hadith_materials_select on public.hadith_materials;
drop policy if exists hadith_materials_admin_write on public.hadith_materials;
create policy hadith_materials_select on public.hadith_materials
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy hadith_materials_admin_write on public.hadith_materials
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists prayer_materials_select on public.daily_prayer_materials;
drop policy if exists prayer_materials_admin_write on public.daily_prayer_materials;
create policy prayer_materials_select on public.daily_prayer_materials
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy prayer_materials_admin_write on public.daily_prayer_materials
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tajwid_materials_select on public.tajwid_materials;
drop policy if exists tajwid_materials_admin_write on public.tajwid_materials;
create policy tajwid_materials_select on public.tajwid_materials
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tajwid_materials_admin_write on public.tajwid_materials
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_templates_select on public.learning_note_templates;
drop policy if exists learning_templates_admin_write on public.learning_note_templates;
create policy learning_templates_select on public.learning_note_templates
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy learning_templates_admin_write on public.learning_note_templates
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Assessments/notes/history: guru sees own students; Admin/Koordinator read
-- tenant-wide (supervisi-ready, rule #30); wali none in V6 (rule #31).
-- Writes ONLY via RPCs.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_assessments_select on public.learning_assessments;
create policy learning_assessments_select on public.learning_assessments
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
            where ts.student_id = learning_assessments.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_notes_select on public.learning_assessment_notes;
create policy learning_notes_select on public.learning_assessment_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.learning_assessments a
      where a.id = assessment_id
        and a.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = a.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists learning_history_select on public.learning_assessment_history;
create policy learning_history_select on public.learning_assessment_history
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
            where ts.student_id = learning_assessment_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- ============================================================================
-- 12. KARTU PRESTASI convenience view extended with V6 modules (read-side)
-- ============================================================================
create or replace view public.achievement_card_learning
with (security_invoker = on) as  -- RLS of underlying tables applies (no bypass)
  select
    h.tenant_id, h.student_id, h.assessment_id as ref_id,
    h.assessed_date::timestamptz as occurred_at,
    h.module_type::text as module,
    h.material_title, h.status::text as status,
    h.score_label, h.score_value, h.notes_snapshot,
    t.full_name as teacher_name
  from public.learning_assessment_history h
  left join public.teachers t on t.id = h.teacher_id
  where h.change_kind in ('CREATE', 'UPDATE');
