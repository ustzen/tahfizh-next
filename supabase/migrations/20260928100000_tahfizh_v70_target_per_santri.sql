-- ============================================================================
-- TAHFIZH V70 — TARGET: PER HALAQAH ATAU PER SANTRI
-- ============================================================================
-- Kebutuhan: target selama ini hanya bisa diatur PER HALAQAH (V17+). Guru butuh
-- memberi target BERBEDA untuk santri tertentu — termasuk memilih BEBERAPA
-- santri sekaligus dalam satu tindakan (mis. "kelompok yang harus kejar
-- setoran").
--
-- Perubahan:
--   1. Tabel `student_targets` — baris per santri per jenis, bentuk sama dengan
--      `halaqah_targets` (kategori, cakupan, isi katalog, keterangan); menimpa
--      target halaqah untuk santri yang memilikinya.
--   2. RPC guru: target_santri_overview() / target_santri_save() /
--      target_santri_clear(). Save menerima DAFTAR santri (multi-pilih);
--      satu transaksi untuk semua santri terpilih (ALL-OR-NOTHING).
--   3. `santri_target_progress()` (papan target santri + meter prestasi) kini:
--      santri yang punya target per santri → memakai baris tsb; sisanya tetap
--      target halaqah. Tidak ada data lama yang berubah.
--
-- Idempoten: drop/create ulang (aman rerun).
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabel student_targets
-- -----------------------------------------------------------------------------
create table if not exists public.student_targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  category      text not null check (category in ('TAHFIDZ', 'HADITS', 'DOA')),
  scope         text not null check (scope in ('TAHUN', 'GANJIL', 'GENAP')) default 'TAHUN',
  items         text,                                  -- data lama/teks (boleh null di mode katalog)
  item_ids      uuid[],                                -- V+ isi dari katalog lembaga (urutan guru)
  target_value  integer not null check (target_value between 1 and 10000),
  start_date    date,
  end_date      date,
  description   text check (char_length(description) <= 300),
  teacher_id    uuid references public.teachers (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, category)
);

create index if not exists student_targets_tenant_idx on public.student_targets (tenant_id);

drop trigger if exists student_targets_updated_at on public.student_targets;
create trigger student_targets_updated_at
  before update on public.student_targets
  for each row execute function public.touch_updated_at();

alter table public.student_targets enable row level security;

drop policy if exists student_targets_select on public.student_targets;
create policy student_targets_select on public.student_targets
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1
            from public.halaqah_students hs
            join public.halaqah_teachers ht on ht.halaqah_id = hs.halaqah_id
            where hs.student_id = student_targets.student_id
              and hs.left_at is null
              and ht.teacher_id = public.halaqah_current_teacher()
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- -----------------------------------------------------------------------------
-- 2. RPC target_santri_overview — binaan guru + daftar target per santri
-- -----------------------------------------------------------------------------
drop function if exists public.target_santri_overview();

create or replace function public.target_santri_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_binaan  jsonb;
  v_targets jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    return jsonb_build_object('binaan', '[]'::jsonb, 'targets', '[]'::jsonb);
  end if;

  -- Semua santri aktif di halaqah yang diampu guru (untuk multi-pilih).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', s.id,
             'name', s.full_name,
             'halaqahName', h.name
           ) order by s.full_name), '[]'::jsonb)
  into v_binaan
  from (
    select distinct on (hs.student_id) hs.student_id, h.id as halaqah_id
    from public.halaqah_teachers ht
    join public.halaqahs h on h.id = ht.halaqah_id and h.tenant_id = v_tenant and h.status = 'ACTIVE'
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher
    order by hs.student_id, hs.joined_at desc
  ) bh
  join public.students s on s.id = bh.student_id and s.tenant_id = v_tenant and s.status = 'ACTIVE'
  join public.halaqahs h on h.id = bh.halaqah_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', st.id,
             'studentId', st.student_id,
             'studentName', s.full_name,
             'halaqahName', h.name,
             'category', st.category,
             'targetValue', st.target_value,
             'scope', st.scope,
             -- Nama tampilan mengikuti urutan guru (V63) — rename katalog ikut.
             'items', coalesce(array_to_string(public.target_item_names(st.category, st.item_ids), E'\n'), st.items),
             'itemIds', st.item_ids,
             'description', st.description,
             'updatedAt', st.updated_at
           ) order by s.full_name, st.category), '[]'::jsonb)
  into v_targets
  from public.student_targets st
  join public.students s on s.id = st.student_id
  left join lateral (
    select distinct on (hs.student_id) hs.halaqah_id
    from public.halaqah_students hs
    where hs.student_id = st.student_id
      and hs.left_at is null
    order by hs.student_id, hs.joined_at desc
  ) ch on true
  left join public.halaqahs h on h.id = ch.halaqah_id
  where st.tenant_id = v_tenant
    and st.student_id in (
      select hs.student_id
      from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher
        and hs.student_id = st.student_id
    );

  return jsonb_build_object('binaan', v_binaan, 'targets', v_targets);
end;
$$;

grant execute on function public.target_santri_overview() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. RPC target_santri_save — beri target 1 jenis ke BANYAK santri sekaligus
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | KATEGORI_TIDAK_VALID |
--            CAKUPAN_TIDAK_VALID | ISI_TARGET_KOSONG | ISI_TARGET_TERLALU_BANYAK |
--            ITEM_TIDAK_VALID | SANTRI_TIDAK_VALID | SANTRI_TERLALU_BANYAK |
--            DESKRIPSI_TERLALU_PANJANG
-- -----------------------------------------------------------------------------
drop function if exists public.target_santri_save(uuid[], text, text, uuid[], text);

create or replace function public.target_santri_save(
  p_student_ids uuid[],
  p_category    text,
  p_scope       text,
  p_item_ids    uuid[],
  p_description text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_ids     uuid[];
  v_students uuid[];
  v_count   integer;
  v_rows    integer;
  v_ok      integer;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  if p_category is null or p_category not in ('TAHFIDZ', 'HADITS', 'DOA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;
  if p_scope is null or p_scope not in ('TAHUN', 'GANJIL', 'GENAP') then
    raise exception 'CAKUPAN_TIDAK_VALID';
  end if;
  if v_desc is not null and char_length(v_desc) > 300 then
    raise exception 'DESKRIPSI_TERLALU_PANJANG';
  end if;

  -- Dedup item tanpa mengubah urutan guru (pola V63).
  select coalesce(array_agg(x order by ord), '{}') into v_ids
  from (
    select distinct on (x) x, ord
    from unnest(coalesce(p_item_ids, '{}')) with ordinality as u(x, ord)
    where x is not null
    order by x, ord
  ) s;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 1 then
    raise exception 'ISI_TARGET_KOSONG';
  end if;
  if v_count > 500 then
    raise exception 'ISI_TARGET_TERLALU_BANYAK';
  end if;

  -- Semua ID harus item katalog lembaga ini sesuai kategori.
  if p_category = 'TAHFIDZ' then
    select count(*) into v_ok
    from unnest(v_ids) as u(id)
    join public.tahfidz_tenant_surahs ts on ts.id = u.id
    where ts.tenant_id = v_tenant;
  elsif p_category = 'HADITS' then
    select count(*) into v_ok
    from unnest(v_ids) as u(id)
    join public.hadith_materials hm on hm.id = u.id
    where hm.tenant_id = v_tenant;
  else
    select count(*) into v_ok
    from unnest(v_ids) as u(id)
    join public.daily_prayer_materials dp on dp.id = u.id
    where dp.tenant_id = v_tenant;
  end if;
  if v_ok is null or v_ok <> v_count then
    raise exception 'ITEM_TIDAK_VALID';
  end if;

  -- Dedup santri + validasi semua binaan aktif guru ini di tenant-nya.
  select coalesce(array_agg(distinct u.id), '{}') into v_students
  from unnest(coalesce(p_student_ids, '{}')) as u(id)
  where u.id is not null;
  if coalesce(array_length(v_students, 1), 0) < 1 then
    raise exception 'SANTRI_TIDAK_VALID';
  end if;
  if array_length(v_students, 1) > 200 then
    raise exception 'SANTRI_TERLALU_BANYAK';
  end if;

  select count(*) into v_ok
  from unnest(v_students) as u(sid)
  join public.students s on s.id = u.sid and s.tenant_id = v_tenant and s.status = 'ACTIVE'
  join public.halaqah_students hs on hs.student_id = s.id and hs.left_at is null
  join public.halaqah_teachers ht on ht.halaqah_id = hs.halaqah_id and ht.teacher_id = v_teacher;
  if v_ok is null or v_ok <> array_length(v_students, 1) then
    raise exception 'SANTRI_TIDAK_VALID';
  end if;

  -- Satu baris per santri — ALL-OR-NOTHING dalam satu transaksi RPC.
  insert into public.student_targets (
    tenant_id, student_id, category, scope, items, item_ids, target_value,
    start_date, end_date, description, teacher_id, created_by, updated_by
  )
  select v_tenant, u.sid, p_category, p_scope, null, v_ids, v_count, null, null,
         v_desc, v_teacher, v_uid, v_uid
  from unnest(v_students) as u(sid)
  on conflict (student_id, category) do update set
    scope        = excluded.scope,
    items        = null,
    item_ids     = excluded.item_ids,
    target_value = excluded.target_value,
    description  = excluded.description,
    teacher_id   = v_teacher,
    updated_by   = v_uid;
  get diagnostics v_rows = row_count;

  return v_rows;
end;
$$;

grant execute on function public.target_santri_save(uuid[], text, text, uuid[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC target_santri_clear — kosongkan target 1 jenis untuk santri terpilih
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | KATEGORI_TIDAK_VALID |
--            SANTRI_TIDAK_VALID
-- -----------------------------------------------------------------------------
drop function if exists public.target_santri_clear(uuid[], text);

create or replace function public.target_santri_clear(
  p_student_ids uuid[],
  p_category    text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_students uuid[];
  v_rows    integer;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  if p_category is null or p_category not in ('TAHFIDZ', 'HADITS', 'DOA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;

  select coalesce(array_agg(distinct u.id), '{}') into v_students
  from unnest(coalesce(p_student_ids, '{}')) as u(id)
  where u.id is not null;
  if coalesce(array_length(v_students, 1), 0) < 1 then
    raise exception 'SANTRI_TIDAK_VALID';
  end if;

  -- Hanya baris santri binaan guru ini boleh dihapus.
  delete from public.student_targets st
  where st.tenant_id = v_tenant
    and st.category = p_category
    and st.student_id = any(v_students)
    and exists (
      select 1
      from public.halaqah_students hs
      join public.halaqah_teachers ht on ht.halaqah_id = hs.halaqah_id
      where hs.student_id = st.student_id
        and hs.left_at is null
        and ht.teacher_id = v_teacher
    );
  get diagnostics v_rows = row_count;

  return v_rows;
end;
$$;

grant execute on function public.target_santri_clear(uuid[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. santri_target_progress() — target per santri MENIMPA target halaqah.
--    Body V61 dipertahankan; CTE `target` kini 2 cabang:
--    (a) cabang halaqah untuk tanpa target per santri,
--    (b) cabang student_targets yang menimpa.
-- -----------------------------------------------------------------------------
drop function if exists public.santri_target_progress();

create or replace function public.santri_target_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
  v_out    jsonb;
begin
  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
  ),
  anak_halaqah as (
    select distinct on (hs.student_id)
      hs.student_id, hs.halaqah_id, h.name as halaqah_name
    from public.halaqah_students hs
    join public.halaqahs h on h.id = hs.halaqah_id
    join anak a on a.student_id = hs.student_id
    where hs.left_at is null and h.tenant_id = v_tenant
    order by hs.student_id, hs.joined_at desc
  ),
  target as (
    -- (a) Target halaqah — HANYA bila santri ini tidak punya target per santri
    --     untuk jenis yang sama (V70: per santri menimpa target halaqah).
    select a.student_id, a.student_name, ah.halaqah_name,
           ht.id as target_id, ht.category, ht.target_value,
           ht.scope, ht.items, ht.item_ids, ht.description,
           ht.start_date, ht.end_date,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
      and not exists (
        select 1 from public.student_targets st
        where st.student_id = a.student_id
          and st.category = ht.category
      )
    union all
    -- (b) Target per santri (V70) — timpa untuk jenis yang ada.
    select a.student_id, a.student_name, ah.halaqah_name,
           st.id, st.category, st.target_value,
           st.scope, st.items, st.item_ids, st.description,
           st.start_date, st.end_date,
           tc.full_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.student_targets st on st.student_id = a.student_id
    left join public.teachers tc on tc.id = st.teacher_id
    where st.tenant_id = v_tenant
  ),
  progres as (
    select
      t.student_id, t.target_id,
      case
        when t.category = 'TAHFIDZ' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.tahfidz_assessments x
          where x.student_id = t.student_id and x.tenant_id = v_tenant
            and x.status = 'DINILAI'
            and x.tenant_surah_id = any(t.item_ids)
        )
        when t.category = 'HADITS' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type = 'HADITS' and l.status = 'LULUS'
            and l.hadith_id = any(t.item_ids)
        )
        when t.category = 'DOA' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type = 'DOA' and l.status = 'LULUS'
            and l.prayer_id = any(t.item_ids)
        )
        when t.category = 'TAHFIDZ' then (
          select count(*) from public.tahfidz_assessments x
          where x.student_id = t.student_id and x.tenant_id = v_tenant
            and x.status = 'DINILAI'
            and x.assessed_at::date between per.period_start and per.period_end
        )
        else (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type::text = t.category
            and l.status::text = 'LULUS'
            and l.assessed_date between per.period_start and per.period_end
        )
      end as capaian
    from target t
    cross join lateral public.target_scope_period(v_tenant, t.scope, t.start_date, t.end_date) per
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   t.student_id,
           'studentName', t.student_name,
           'halaqahName', t.halaqah_name,
           'targetId',    t.target_id,
           'category',    t.category,
           'targetValue', t.target_value,
           'capaian',     coalesce(p.capaian, 0),
           'scope',       t.scope,
           'items',       coalesce(array_to_string(public.target_item_names(t.category, t.item_ids), E'\n'), t.items),
           'itemStatus',  public.target_item_status(
                            t.category, t.item_ids, t.items, t.student_id, v_tenant
                          ),
           'description', t.description,
           'teacherName', t.teacher_name
         ) order by t.student_name, t.category), '[]'::jsonb)
  into v_out
  from target t
  left join progres p on p.target_id = t.target_id and p.student_id = t.student_id;

  return v_out;
end;
$$;

grant execute on function public.santri_target_progress() to authenticated;
