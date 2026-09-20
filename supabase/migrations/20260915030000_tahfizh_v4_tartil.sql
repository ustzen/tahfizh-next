-- ============================================================================
-- TAHFIZH V4 — Modul Tartil + Kartu Prestasi
-- New migration; does NOT alter V1–V3 tables destructively.
--
-- Adds:
--   * tartil_materials        (per-tenant master materi: Iqra 1..6, Al-Qur'an…)
--   * tartil_note_templates   (per-tenant structured note templates, 5 slots)
--   * tartil_assessments      (penilaian Tartil; soft-delete safe)
--   * tartil_assessment_notes (structured notes 1:N — Apresiasi/Bacaan/…)
--   * RPCs: tartil_save_assessment, tartil_save_assessments_bulk,
--           tartil_teacher_summaries, tartil_student_timeline
--   * Seed default materials + default templates on tenant creation
--   * Full RLS (tenant isolation + guru-scoped rows)
--
-- Kartu Prestasi (rule #16-#19): NO duplicate storage. The achievement card
-- is a VIEW over tartil_assessment_history (+ tahfidz history ready for V4+),
-- so every saved Tartil assessment automatically appears — one input only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.tartil_note_slot as enum (
    'APRESIASI', 'BACAAN', 'FASHOHAH', 'SARAN', 'CATATAN_ORANG_TUA'
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. MASTER MATERI TARTIL (per tenant, rule #6-#8)
--    Seeded automatically for each new tenant (trigger) + RPC to backfill
--    existing tenants. Admin manages; guru reads.
-- ============================================================================
create table if not exists public.tartil_materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  jilid        text check (char_length(jilid) <= 40),
  pages_label  text check (char_length(pages_label) <= 60),  -- e.g. "3–4"
  description  text check (char_length(description) <= 300), -- e.g. "Bacaan huruf bersambung"
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists tartil_materials_tenant_idx
  on public.tartil_materials (tenant_id, is_active, sort_order);

drop trigger if exists tartil_materials_updated_at on public.tartil_materials;
create trigger tartil_materials_updated_at
  before update on public.tartil_materials
  for each row execute function public.touch_updated_at();

-- Default materials for NEW tenants (V1 rule #45-compatible: explicit seed,
-- no fake demo data — these are configuration defaults, not demo rows).
create or replace function public.tartil_seed_materials()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tartil_materials (tenant_id, name, jilid, sort_order) values
    (new.id, 'Iqra Jilid 1', '1', 1),
    (new.id, 'Iqra Jilid 2', '2', 2),
    (new.id, 'Iqra Jilid 3', '3', 3),
    (new.id, 'Iqra Jilid 4', '4', 4),
    (new.id, 'Iqra Jilid 5', '5', 5),
    (new.id, 'Iqra Jilid 6', '6', 6),
    (new.id, 'Al-Qur''an',   null, 7)
  on conflict (tenant_id, name) do nothing;

  insert into public.tartil_note_templates (tenant_id, slot, content, sort_order) values
    (new.id, 'APRESIASI', 'Alhamdulillah, bacaan ananda sudah semakin baik.', 1),
    (new.id, 'BACAAN', 'Perhatikan panjang pendek bacaan (mad & harakat).', 2),
    (new.id, 'FASHOHAH', 'Perhatikan makhraj huruf.', 3),
    (new.id, 'SARAN', 'Latihan membaca secara rutin.', 4),
    (new.id, 'CATATAN_ORANG_TUA', 'Mohon pendampingan membaca di rumah.', 5)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_tartil_seed on public.tenants;
create trigger tenants_tartil_seed
  after insert on public.tenants
  for each row execute function public.tartil_seed_materials();

-- Backfill for tenants created BEFORE this migration (idempotent).
-- V12 FIX: versi lama memanggil public.tartil_seed_materials(<row tenants>)
-- padahal fungsi itu TRIGGER tanpa argumen → error 42883 "function
-- tartil_seed_materials(tenants) does not exist" saat migration dijalankan
-- di database yang sudah punya tenant.
-- Pola V12: isi default HANYA bila tenant belum punya satu pun (WHERE NOT
-- EXISTS) — data lama milik lembaga tidak pernah tersentuh, dan menjalankan
-- ulang (rerun) tidak pernah menduplikasi baris.
create or replace function public.tartil_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tartil_materials (tenant_id, name, jilid, sort_order)
  select p_tenant, v.name, v.jilid, v.sort_order
  from (values
    ('Iqra Jilid 1', '1', 1),
    ('Iqra Jilid 2', '2', 2),
    ('Iqra Jilid 3', '3', 3),
    ('Iqra Jilid 4', '4', 4),
    ('Iqra Jilid 5', '5', 5),
    ('Iqra Jilid 6', '6', 6),
    ('Al-Qur''an',   null, 7)
  ) as v(name, jilid, sort_order)
  where not exists (select 1 from public.tartil_materials m where m.tenant_id = p_tenant);

  insert into public.tartil_note_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.tartil_note_slot, v.content, v.sort_order
  from (values
    ('APRESIASI', 'Alhamdulillah, bacaan ananda sudah semakin baik.', 1),
    ('BACAAN', 'Perhatikan panjang pendek bacaan (mad & harakat).', 2),
    ('FASHOHAH', 'Perhatikan makhraj huruf.', 3),
    ('SARAN', 'Latihan membaca secara rutin.', 4),
    ('CATATAN_ORANG_TUA', 'Mohon pendampingan membaca di rumah.', 5)
  ) as v(slot, content, sort_order)
  where not exists (select 1 from public.tartil_note_templates t where t.tenant_id = p_tenant);
end;
$$;

-- ============================================================================
-- 2. TEMPLATE CATATAN (per tenant; rule #13-#15)
--    slot = which structured section the template belongs to.
-- ============================================================================
create table if not exists public.tartil_note_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  slot       public.tartil_note_slot not null,
  content    text not null check (char_length(content) between 1 and 300),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tartil_note_templates_tenant_idx
  on public.tartil_note_templates (tenant_id, slot, sort_order);

drop trigger if exists tartil_note_templates_updated_at on public.tartil_note_templates;
create trigger tartil_note_templates_updated_at
  before update on public.tartil_note_templates
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. ASSESSMENTS (rule #5, #9-#11, #38, #40)
--    * Reuses the V3 scoring system (tahfidz_settings mode + grades) — there
--      is exactly ONE scoring configuration per lembaga (rule #46).
--    * status/history pattern mirrors tahfidz: BELUM/DIPELAJARI/DINILAI.
--    * Soft delete (deleted_at) — history stays intact (rule #40).
-- ============================================================================
create table if not exists public.tartil_assessments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  material_id  uuid not null references public.tartil_materials (id) on delete restrict,
  teacher_id   uuid references public.teachers (id) on delete set null,
  assessed_by  uuid references public.profiles (id) on delete set null,
  assessed_at  timestamptz not null default now(),
  pages_label  text check (char_length(pages_label) <= 60),
  status       public.tahfidz_progress not null default 'DINILAI',
  score_value  integer check (score_value between 1 and 100),
  score_label  text check (char_length(score_label) between 1 and 10),
  free_note    text check (char_length(free_note) <= 500),
  deleted_at   timestamptz,
  deleted_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tartil_assessments_tenant_idx
  on public.tartil_assessments (tenant_id, assessed_at desc);
create index if not exists tartil_assessments_student_idx
  on public.tartil_assessments (student_id, assessed_at desc);
create index if not exists tartil_assessments_material_idx
  on public.tartil_assessments (material_id);

drop trigger if exists tartil_assessments_updated_at on public.tartil_assessments;
create trigger tartil_assessments_updated_at
  before update on public.tartil_assessments
  for each row execute function public.touch_updated_at();

-- Structured notes (1:N): Apresiasi/Bacaan/Fashohah/Sarah/Orang Tua (rule #12).
create table if not exists public.tartil_assessment_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  assessment_id uuid not null references public.tartil_assessments (id) on delete cascade,
  slot          public.tartil_note_slot not null,
  content       text not null check (char_length(content) between 1 and 500),
  created_at    timestamptz not null default now(),
  unique (assessment_id, slot)
);

create index if not exists tartil_notes_assessment_idx
  on public.tartil_assessment_notes (assessment_id);

-- ============================================================================
-- 4. HISTORY — mirror of V3 pattern (rule #38: nothing is overwritten)
-- ============================================================================
create table if not exists public.tartil_assessment_history (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  assessment_id uuid not null references public.tartil_assessments (id) on delete cascade,
  student_id    uuid not null,
  material_id   uuid not null,
  teacher_id    uuid,
  assessed_by   uuid,
  assessed_at   timestamptz not null,
  pages_label   text,
  status        public.tahfidz_progress not null,
  score_value   integer,
  score_label   text,
  free_note     text,
  notes_snapshot jsonb not null default '{}'::jsonb,
  change_kind   text not null default 'UPDATE',   -- CREATE | UPDATE | SOFT_DELETE
  created_at    timestamptz not null default now()
);

create index if not exists tartil_history_student_idx
  on public.tartil_assessment_history (student_id, created_at desc);
create index if not exists tartil_history_assessment_idx
  on public.tartil_assessment_history (assessment_id);

-- History trigger: snapshot the row + structured notes on every write.
create or replace function public.tartil_record_history()
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
  from public.tartil_assessment_notes
  where assessment_id = new.id;

  if tg_op = 'INSERT' then
    v_kind := 'CREATE';
  else
    v_kind := case when new.deleted_at is null then 'UPDATE' else 'SOFT_DELETE' end;
  end if;

  insert into public.tartil_assessment_history (
    tenant_id, assessment_id, student_id, material_id, teacher_id, assessed_by,
    assessed_at, pages_label, status, score_value, score_label, free_note,
    notes_snapshot, change_kind
  ) values (
    new.tenant_id, new.id, new.student_id, new.material_id, new.teacher_id, new.assessed_by,
    new.assessed_at, new.pages_label, new.status, new.score_value, new.score_label, new.free_note,
    v_notes, v_kind
  );
  return new;
end;
$$;

drop trigger if exists tartil_assessments_history on public.tartil_assessments;
create trigger tartil_assessments_history
  after insert or update on public.tartil_assessments
  for each row execute function public.tartil_record_history();

-- ============================================================================
-- 5. RPC — GURU SAVE (session-derived teacher & relationship; rule #30)
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | SANTRI_BUKAN_BINAAN |
--            MATERI_TIDAK_AKTIF | NILAI_TIDAK_VALID | GRADE_TIDAK_VALID
-- ============================================================================
create or replace function public.tartil_save_assessment(
  p_student_id  uuid,
  p_material_id uuid,
  p_pages_label text default null,
  p_status      text default 'DINILAI',
  p_score_value integer default null,
  p_score_label text default null,
  p_free_note   text default null,
  p_notes       jsonb default '{}'::jsonb,   -- {"APRESIASI":"…","SARAN":"…"}
  p_assessment_id uuid default null          -- set = EDIT existing (rule #39)
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
  v_student  public.students;
  v_material public.tartil_materials;
  v_status   public.tahfidz_progress;
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

  select * into v_student from public.students
    where id = p_student_id and tenant_id = v_profile.tenant_id;
  if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

  select * into v_material from public.tartil_materials
    where id = p_material_id and tenant_id = v_profile.tenant_id and is_active;
  if v_material is null then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  -- Validate notes payload (max 5 slots, each ≤ 500 chars).
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    if (select count(*) from jsonb_object_keys(p_notes)) > 5 then
      raise exception 'CATATAN_TIDAK_VALID';
    end if;
    for v_key in select jsonb_object_keys(p_notes) loop
      if coalesce(p_notes ->> v_key, '') = '' then
        raise exception 'CATATAN_TIDAK_VALID';
      end if;
      if char_length(p_notes ->> v_key) > 500 then
        raise exception 'CATATAN_TERLALU_PANJANG';
      end if;
    end loop;
  end if;

  v_status := coalesce(p_status, 'DINILAI')::public.tahfidz_progress;
  if v_status is null then raise exception 'STATUS_TIDAK_VALID'; end if;

  v_mode := coalesce(public.tahfidz_settings_mode(v_profile.tenant_id), 'CENTANG');
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
    end if; -- CENTANG: no payload
  else
    p_score_value := null;
    p_score_label := null;
  end if;

  if p_free_note is not null and char_length(p_free_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  if p_assessment_id is not null then
    -- EDIT: only the owning teacher (same tenant) may edit (rule #39).
    select id into v_id from public.tartil_assessments
    where id = p_assessment_id
      and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id
      and deleted_at is null;
    if v_id is null then raise exception 'AKSES_DITOLAK'; end if;

    update public.tartil_assessments set
      material_id = p_material_id,
      pages_label = p_pages_label,
      assessed_at = now(),
      status      = v_status,
      score_value = p_score_value,
      score_label = p_score_label,
      free_note   = p_free_note
    where id = v_id;
  else
    insert into public.tartil_assessments (
      tenant_id, student_id, material_id, teacher_id, assessed_by,
      assessed_at, pages_label, status, score_value, score_label, free_note
    ) values (
      v_profile.tenant_id, p_student_id, p_material_id, v_teacher.id, v_uid,
      now(), p_pages_label, v_status, p_score_value, p_score_label, p_free_note
    )
    returning id into v_id;
  end if;

  -- Replace structured notes (kept in sync with the snapshot below).
  delete from public.tartil_assessment_notes where assessment_id = v_id;
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    insert into public.tartil_assessment_notes (tenant_id, assessment_id, slot, content)
    select v_profile.tenant_id, v_id, k::public.tartil_note_slot, p_notes ->> k
    from jsonb_object_keys(p_notes) as k
    on conflict (assessment_id, slot) do update set content = excluded.content;
  end if;

  return v_id;
end;
$$;

-- Soft delete: hides from active views while history (and Kartu Prestasi
-- via history) stays intact; the RPC records a SOFT_DELETE history row.
create or replace function public.tartil_soft_delete_assessment(p_assessment_id uuid)
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

  update public.tartil_assessments set
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_assessment_id
    and tenant_id = v_profile.tenant_id
    and teacher_id = v_teacher.id
    and deleted_at is null;

  if not found then raise exception 'AKSES_DITOLAK'; end if;
end;
$$;

-- ============================================================================
-- 6. RPC — TEACHER SUMMARIES (fast list; rule #33)
-- ============================================================================
create or replace function public.tartil_teacher_summaries(p_teacher_id uuid)
returns table (
  student_id       uuid,
  business_code    text,
  full_name        text,
  gender           public.gender_type,
  student_status   public.entity_status,
  assessed_count   bigint,
  last_material    text,
  last_pages       text,
  last_score_label text,
  last_score_value integer,
  last_mode        public.tahfidz_mode,
  last_assessed_at timestamptz
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
      a.student_id, a.pages_label, a.score_label, a.score_value,
      a.assessed_at,
      coalesce(m.pages_label, a.pages_label) as material_pages,
      m.name as material_name
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    where a.student_id in (select id from assigned)
      and a.deleted_at is null
      and a.status = 'DINILAI'
    order by a.student_id, a.assessed_at desc
  ),
  counts as (
    select student_id, count(*)::bigint as assessed_count
    from public.tartil_assessments
    where student_id in (select id from assigned) and deleted_at is null
    group by student_id
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(c.assessed_count, 0),
    l.material_name, l.pages_label, l.score_label, l.score_value,
    public.tahfidz_settings_mode((select tenant_id from public.teachers where id = p_teacher_id)),
    l.assessed_at
  from assigned a
  left join latest l on l.student_id = a.id
  left join counts c on c.student_id = a.id
  order by a.full_name;
$$;

-- ============================================================================
-- 7. RPC — STUDENT TARTIL DETAIL (history for guru detail page)
-- ============================================================================
create or replace function public.tartil_student_assessments(p_student_id uuid)
returns table (
  id            uuid,
  material_name text,
  pages_label   text,
  assessed_at   timestamptz,
  status        public.tahfidz_progress,
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
    m.name,
    a.pages_label,
    a.assessed_at,
    a.status,
    a.score_value,
    a.score_label,
    a.free_note,
    t.full_name,
    coalesce((
      select jsonb_object_agg(n.slot, n.content)
      from public.tartil_assessment_notes n where n.assessment_id = a.id
    ), '{}'::jsonb),
    a.updated_at
  from public.tartil_assessments a
  join public.tartil_materials m on m.id = a.material_id
  left join public.teachers t on t.id = a.teacher_id
  where a.student_id = p_student_id
    and a.tenant_id = public.current_tenant_id()
    and a.deleted_at is null
  order by a.assessed_at desc
  limit 100;
$$;

-- ============================================================================
-- 8. RPC — KARTU PRESTASI TIMELINE (rule #16-#21)
--    Achievement card = unified view over module histories. V4 includes
--    Tartil + Tahfidz entries; future modules just extend this RPC.
--    Access: USTADZ (own students) or ADMIN (own tenant). Wali-ready for V5+
--    via the p_guardian_profile_id parameter (unused in V4 UI).
-- ============================================================================
create or replace function public.tartil_student_timeline(
  p_student_id uuid,
  p_module     text default 'ALL'   -- ALL | TARTIL | TAHFIDZ
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
    -- TARTIL entries (from tartil history; creation + latest edit collapsed
    -- by taking the newest row per assessment; CREATE only for timeline).
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

    -- TAHFIDZ entries (rule #19 — reuse V3 history without touching it).
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
  ) combined
  where (p_module = 'ALL' or module = p_module)
  order by occurred_at desc
  limit 200;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================
alter table public.tartil_materials         enable row level security;
alter table public.tartil_note_templates    enable row level security;
alter table public.tartil_assessments       enable row level security;
alter table public.tartil_assessment_notes  enable row level security;
alter table public.tartil_assessment_history enable row level security;

-- Config tables: members read; ADMIN writes (rule #24; guru cannot change).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tartil_materials_select on public.tartil_materials;
drop policy if exists tartil_materials_admin_write on public.tartil_materials;
create policy tartil_materials_select on public.tartil_materials
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tartil_materials_admin_write on public.tartil_materials
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tartil_templates_select on public.tartil_note_templates;
drop policy if exists tartil_templates_admin_write on public.tartil_note_templates;
create policy tartil_templates_select on public.tartil_note_templates
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

create policy tartil_templates_admin_write on public.tartil_note_templates
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN')
  with check (tenant_id = public.current_tenant_id() and public.current_role() = 'ADMIN');

-- Assessments: guru sees rows for own assigned students; Admin/Koordinator
-- read tenant-wide (future supervisi/raport); wali none in V4.
-- Writes ONLY via RPCs (defense in depth — same pattern as V3).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tartil_assessments_select on public.tartil_assessments;
create policy tartil_assessments_select on public.tartil_assessments
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
          where ts.student_id = tartil_assessments.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists tartil_notes_select on public.tartil_assessment_notes;
create policy tartil_notes_select on public.tartil_assessment_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.tartil_assessments a
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
drop policy if exists tartil_history_select on public.tartil_assessment_history;
create policy tartil_history_select on public.tartil_assessment_history
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
          where ts.student_id = tartil_assessment_history.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

-- ============================================================================
-- 10. KARTU PRESTASI VIEW (bonus convenience; RPC above is the real API)
-- ============================================================================
create or replace view public.achievement_card_tartil
with (security_invoker = on) as  -- RLS of underlying tables applies (no bypass)
  select
    h.tenant_id, h.student_id, h.assessment_id as ref_id,
    h.assessed_at as occurred_at, m.name as material, h.pages_label,
    h.score_label, h.score_value, h.notes_snapshot, t.full_name as teacher_name
  from public.tartil_assessment_history h
  join public.tartil_materials m on m.id = h.material_id
  left join public.teachers t on t.id = h.teacher_id
  where h.change_kind in ('CREATE', 'UPDATE');

-- ============================================================================
-- 11. Backfill defaults for existing tenants (run once at migration time).
--     Runs after tables exist; safe to re-run.
-- ============================================================================
-- V12 (idempotent, per-tenant guard): satu tenant yang gagal seed default
-- TIDAK PERNAH menggagalkan seluruh migration/file gabungan — cukup warning,
-- rerun tetap aman.
do $$
declare
  v_tenant record;
begin
  for v_tenant in select id from public.tenants loop
    begin
      perform public.tartil_backfill_defaults(v_tenant.id);
    exception when others then
      raise warning 'tartil_backfill_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
    end;
  end loop;
end
$$;
