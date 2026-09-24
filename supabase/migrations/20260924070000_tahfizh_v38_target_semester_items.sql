-- ============================================================================
-- TAHFIZH V38 — TARGET HALAQAH: cakupan (tahun ajaran / semester) + isi target
-- ============================================================================
-- Perubahan:
--   1. Target TIDAK lagi memakai tanggal mulai/selesai. Diganti kolom `scope`:
--        TAHUN  = 1 tahun ajaran
--        GANJIL = semester ganjil (semester 1)
--        GENAP  = semester genap  (semester 2)
--   2. Target berisi daftar yang DIKETIK guru (kolom `items`, satu per baris):
--        TAHFIDZ = nama surat, HADITS = nama hadits, DOA = nama doa.
--      `target_value` (jumlah) dihitung otomatis dari banyaknya isi.
--   3. Progres wali santri memakai tanggal tahun ajaran / semester AKTIF
--      (academic_years / academic_semesters) sesuai `scope`.
-- Data lama: scope = TAHUN, items = NULL (tetap tampil sebagai jumlah).
-- Idempoten: aman dijalankan ulang.
-- ============================================================================

-- 1. Kolom baru; tanggal jadi opsional (dipertahankan hanya untuk data lama)
alter table public.halaqah_targets
  add column if not exists scope text not null default 'TAHUN';
alter table public.halaqah_targets
  add column if not exists items text;

alter table public.halaqah_targets alter column start_date drop not null;
alter table public.halaqah_targets alter column end_date   drop not null;
alter table public.halaqah_targets drop constraint if exists halaqah_targets_period_check;

alter table public.halaqah_targets drop constraint if exists halaqah_targets_scope_check;
alter table public.halaqah_targets
  add constraint halaqah_targets_scope_check check (scope in ('TAHUN', 'GANJIL', 'GENAP'));

alter table public.halaqah_targets drop constraint if exists halaqah_targets_items_check;
alter table public.halaqah_targets
  add constraint halaqah_targets_items_check check (items is null or char_length(items) <= 5000);

-- 2. Periode efektif sebuah target (untuk menghitung capaian)
create or replace function public.target_scope_period(
  p_tenant uuid,
  p_scope  text,
  p_start  date,
  p_end    date
)
returns table (period_start date, period_end date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year public.academic_years;
  v_from date;
  v_to   date;
begin
  select * into v_year
  from public.academic_years
  where tenant_id = p_tenant and status = 'ACTIVE'
  order by start_date desc
  limit 1;

  if v_year.id is not null then
    if p_scope = 'GANJIL' then
      select s.start_date, s.end_date into v_from, v_to
      from public.academic_semesters s
      where s.academic_year_id = v_year.id and s.sequence = 1;
    elsif p_scope = 'GENAP' then
      select s.start_date, s.end_date into v_from, v_to
      from public.academic_semesters s
      where s.academic_year_id = v_year.id and s.sequence = 2;
    else
      v_from := v_year.start_date;
      v_to   := v_year.end_date;
    end if;
  end if;

  -- Cadangan: data lama yang masih punya tanggal; bila tidak ada, semua waktu.
  period_start := coalesce(v_from, p_start, date '1900-01-01');
  period_end   := coalesce(v_to,   p_end,   date '2999-12-31');
  return next;
end;
$$;

grant execute on function public.target_scope_period(uuid, text, date, date) to authenticated;

-- 3. Overview: halaqah yang diampu + target (tanpa tanggal; dengan scope & items)
create or replace function public.target_halaqah_overview()
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
  v_halaqah jsonb;
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
    return jsonb_build_object('halaqah', '[]'::jsonb, 'targets', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'name', h.name,
             'studentCount', (
               select count(*) from public.halaqah_students hs
               join public.students s on s.id = hs.student_id
               where hs.halaqah_id = h.id and hs.left_at is null and s.status = 'ACTIVE'
             )
           ) order by h.name), '[]'::jsonb)
  into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id and ht.teacher_id = v_teacher
  where h.tenant_id = v_tenant;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', t.id,
             'halaqahId', t.halaqah_id,
             'category', t.category,
             'scope', t.scope,
             'items', t.items,
             'targetValue', t.target_value,
             'description', t.description,
             'updatedAt', t.updated_at
           ) order by t.category), '[]'::jsonb)
  into v_targets
  from public.halaqah_targets t
  where t.tenant_id = v_tenant
    and t.halaqah_id in (
      select ht.halaqah_id from public.halaqah_teachers ht where ht.teacher_id = v_teacher
    );

  return jsonb_build_object('halaqah', v_halaqah, 'targets', v_targets);
end;
$$;

grant execute on function public.target_halaqah_overview() to authenticated;

-- 4. Simpan target: p_items = isi yang diketik (pisah baris / koma / titik koma)
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | KATEGORI_TIDAK_VALID |
--            CAKUPAN_TIDAK_VALID | ISI_TARGET_KOSONG | ISI_TARGET_TERLALU_BANYAK |
--            ISI_TARGET_TERLALU_PANJANG | DESKRIPSI_TERLALU_PANJANG |
--            HALAQAH_TIDAK_VALID
drop function if exists public.target_halaqah_save(uuid, text, integer, date, date, text);
drop function if exists public.target_halaqah_save(uuid, text, text, text, text);

create or replace function public.target_halaqah_save(
  p_halaqah_id  uuid,
  p_category    text,
  p_scope       text,
  p_items       text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_halaqah uuid;
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_list    text[];
  v_count   integer;
  v_items   text;
  v_id      uuid;
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

  -- Pecah isi: baris baru / koma / titik koma; buang kosong & spasi ganda.
  select coalesce(array_agg(x.item order by x.ord), '{}')
  into v_list
  from (
    select btrim(regexp_replace(part, '\s+', ' ', 'g')) as item, ord
    from regexp_split_to_table(coalesce(p_items, ''), '[\r\n,;]+')
         with ordinality as t(part, ord)
  ) x
  where x.item <> '';

  v_count := coalesce(array_length(v_list, 1), 0);
  if v_count < 1 then
    raise exception 'ISI_TARGET_KOSONG';
  end if;
  if v_count > 500 then
    raise exception 'ISI_TARGET_TERLALU_BANYAK';
  end if;
  v_items := array_to_string(v_list, E'\n');
  if char_length(v_items) > 5000 then
    raise exception 'ISI_TARGET_TERLALU_PANJANG';
  end if;

  select h.id into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id
  where h.id = p_halaqah_id
    and h.tenant_id = v_tenant
    and ht.teacher_id = v_teacher;
  if v_halaqah is null then
    raise exception 'HALAQAH_TIDAK_VALID';
  end if;

  insert into public.halaqah_targets (
    tenant_id, halaqah_id, category, scope, items, target_value,
    start_date, end_date, description, teacher_id, created_by, updated_by
  ) values (
    v_tenant, v_halaqah, p_category, p_scope, v_items, v_count,
    null, null, v_desc, v_teacher, v_uid, v_uid
  )
  on conflict (halaqah_id, category) do update set
    scope        = excluded.scope,
    items        = excluded.items,
    target_value = excluded.target_value,
    start_date   = null,
    end_date     = null,
    description  = excluded.description,
    teacher_id   = excluded.teacher_id,
    updated_by   = excluded.updated_by
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.target_halaqah_save(uuid, text, text, text, text) to authenticated;

-- 5. Dashboard guru: jumlah target = semua target halaqah yang diampu
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
    from public.halaqah_targets ht2
    join public.halaqah_teachers hte on hte.halaqah_id = ht2.halaqah_id
    join session_teacher st on st.id = hte.teacher_id
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

-- 6. Progres wali santri: periode dari tahun ajaran / semester sesuai scope
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
    select a.student_id, a.student_name, ah.halaqah_name,
           ht.id as target_id, ht.category, ht.target_value,
           ht.scope, ht.items, ht.description,
           per.period_start, per.period_end,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    cross join lateral public.target_scope_period(v_tenant, ht.scope, ht.start_date, ht.end_date) per
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
  ),
  progres as (
    select t.student_id, t.target_id,
           case t.category
             when 'TAHFIDZ' then (
               select count(*) from public.tahfidz_assessments x
               where x.student_id = t.student_id and x.tenant_id = v_tenant
                 and x.status = 'DINILAI'
                 and x.assessed_at::date between t.period_start and t.period_end
             )
             else (
               select count(*) from public.learning_assessments l
               where l.student_id = t.student_id and l.tenant_id = v_tenant
                 and l.deleted_at is null
                 and l.module_type::text = t.category
                 and l.status::text = 'LULUS'
                 and l.assessed_date between t.period_start and t.period_end
             )
           end as capaian
    from target t
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
           'items',       t.items,
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
