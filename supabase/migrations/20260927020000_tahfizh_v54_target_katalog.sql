-- ============================================================================
-- TAHFIZH V54 — Target berbasis katalog (pilih surah/hadits/doa, bukan ketik)
-- ============================================================================
-- Alur baru:
--   1. ADMIN/KOORDINATOR mengelola katalog acuan lembaga (sudah ada sejak
--      awal): surah di menu Tahfidz (tahfidz_tenant_surahs), hadits di menu
--      Hadits (hadith_materials), doa di menu Doa (daily_prayer_materials).
--   2. GURU membuat target dengan MEMILIH item dari katalog itu — tidak lagi
--      mengetik nama bebas. target_value = banyak item terpilih.
--   3. Semua tersinkron: target menyimpan ID katalog, jadi bila admin
--      mengganti nama/sort item, target & capaian ikut — dan capaian dihitung
--      dari penilaian pada item yang SAMA (ID) dengan menu Tahfidz/Hadits/Doa.
--
-- Perubahan skema:
--   • halaqah_targets + kolom item_ids uuid[] (bukan FK — item katalog bisa
--     dinonaktifkan/dihapus tanpa merusak target; array menjaga urutan).
--   • item_ids kosong + items terisi = data lama (tetap jalan, mode teks).
--
-- RPC baru:  target_catalog_list(p_category) — opsi picker guru (id/nama/sort
--            dari katalog aktif lembaga; TAHFIDZ/HADITS/DOA).
-- RPC ubah:  target_halaqah_save(...)  — menerima p_item_ids (baru) ATAU
--            p_items teks (kompatibel data lama).
--            target_halaqah_overview() — + item_ids & itemNames (join katalog).
--            santri_target_progress()  — dengan item_ids, capaian dihitung
--            dari penilaian per item-ID (sinkron penuh dengan katalog).
--
-- Idempoten: drop + create ulang, tanpa mengubah tabel penilaian.
-- ============================================================================

-- 1. Kolom item_ids -----------------------------------------------------------
alter table public.halaqah_targets
  add column if not exists item_ids uuid[];

-- 2. RPC katalog untuk picker target ------------------------------------------
drop function if exists public.target_catalog_list(text);

create or replace function public.target_catalog_list(p_category text)
returns table (id uuid, name text, sort_order integer)
language sql
stable
security definer
set search_path = public
as $$
  with p as (select auth.uid() as uid)
  select k.id, k.name, k.sort_order
  from (
    -- TAHFIDZ: surah katalog lembaga (menu Tahfidz).
    select ts.id, coalesce(ts.name_override, m.name) as name, ts.sort_order
    from public.tahfidz_tenant_surahs ts
    left join public.tahfidz_surahs m on m.id = ts.surah_id
    where ts.tenant_id = (select tenant_id from public.profiles where id = (select uid from p))
      and ts.is_active
    union all
    -- HADITS: katalog menu Hadits.
    select hm.id, hm.title, hm.sort_order
    from public.hadith_materials hm
    where hm.tenant_id = (select tenant_id from public.profiles where id = (select uid from p))
      and hm.is_active
    union all
    -- DOA: katalog menu Doa.
    select dp.id, dp.title, dp.sort_order
    from public.daily_prayer_materials dp
    where dp.tenant_id = (select tenant_id from public.profiles where id = (select uid from p))
      and dp.is_active
  ) k
  where (p_category = 'TAHFIDZ' and exists (select 1 from public.tahfidz_tenant_surahs ts2 where ts2.id = k.id))
     or (p_category = 'HADITS' and exists (select 1 from public.hadith_materials h2 where h2.id = k.id))
     or (p_category = 'DOA'    and exists (select 1 from public.daily_prayer_materials d2 where d2.id = k.id))
  order by k.sort_order, k.name;
$$;

grant execute on function public.target_catalog_list(text) to authenticated;

-- 3. Simpan target: pilih item katalog (baru) atau teks (kompatibel lama) -----
drop function if exists public.target_halaqah_save(uuid, text, text, text, text);

create or replace function public.target_halaqah_save(
  p_halaqah_id  uuid,
  p_category    text,
  p_scope       text,
  p_item_ids    uuid[],
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_halaqah  uuid;
  v_desc     text := nullif(btrim(coalesce(p_description, '')), '');
  v_ids      uuid[];
  v_count    integer;
  v_id       uuid;
  v_cat_ok   integer;
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

  -- Dedup + buang null; wajib minimal 1 dan maksimal 500 item.
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_item_ids, '{}')) as x
  where x is not null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 1 then
    raise exception 'ISI_TARGET_KOSONG';
  end if;
  if v_count > 500 then
    raise exception 'ISI_TARGET_TERLALU_BANYAK';
  end if;

  -- Semua ID harus item katalog lembaga ini sesuai kategori (sinkron menu).
  if p_category = 'TAHFIDZ' then
    select count(*) into v_cat_ok
    from unnest(v_ids) as u(id)
    join public.tahfidz_tenant_surahs ts on ts.id = u.id
    where ts.tenant_id = v_tenant;
  elsif p_category = 'HADITS' then
    select count(*) into v_cat_ok
    from unnest(v_ids) as u(id)
    join public.hadith_materials hm on hm.id = u.id
    where hm.tenant_id = v_tenant;
  else
    select count(*) into v_cat_ok
    from unnest(v_ids) as u(id)
    join public.daily_prayer_materials dp on dp.id = u.id
    where dp.tenant_id = v_tenant;
  end if;
  if v_cat_ok is null or v_cat_ok <> v_count then
    raise exception 'ITEM_TIDAK_VALID';
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
    tenant_id, halaqah_id, category, scope, items, item_ids, target_value,
    start_date, end_date, description, teacher_id, created_by, updated_by
  ) values (
    v_tenant, v_halaqah, p_category, p_scope, null, v_ids, v_count,
    null, null, v_desc, v_teacher, v_uid, v_uid
  )
  on conflict (halaqah_id, category) do update set
    scope        = excluded.scope,
    items        = null,           -- mode katalog menggantikan teks lama
    item_ids     = excluded.item_ids,
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

grant execute on function public.target_halaqah_save(uuid, text, text, uuid[], text) to authenticated;

-- 4. Overview guru: + item_ids & itemNames (dari katalog, sinkron nama) -------
drop function if exists public.target_halaqah_overview();

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
             'id',           t.id,
             'halaqahId',    t.halaqah_id,
             'category',     t.category,
             'scope',        t.scope,
             'itemIds',      to_jsonb(coalesce(t.item_ids, '{}'::uuid[])),
             'itemNames',    to_jsonb(coalesce(array_to_string(public.target_item_names(t.category, t.item_ids), E'\n'), t.items)),
             'targetValue',  t.target_value,
             'description',  t.description,
             'updatedAt',    t.updated_at
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

-- 5. Nama item katalog dari daftar ID (urut sesuai array target) ---------------
drop function if exists public.target_item_names(text, uuid[]);

create or replace function public.target_item_names(p_category text, p_ids uuid[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_names text[] := '{}';
  v_name  text;
  i       integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return v_names;
  end if;

  for i in 1..array_length(p_ids, 1) loop
    if p_category = 'TAHFIDZ' then
      select coalesce(ts.name_override, m.name) into v_name
      from public.tahfidz_tenant_surahs ts
      left join public.tahfidz_surahs m on m.id = ts.surah_id
      where ts.id = p_ids[i];
    elsif p_category = 'HADITS' then
      select hm.title into v_name from public.hadith_materials hm where hm.id = p_ids[i];
    elsif p_category = 'DOA' then
      select dp.title into v_name from public.daily_prayer_materials dp where dp.id = p_ids[i];
    end if;
    if v_name is not null then
      v_names := v_names || v_name;
    end if;
  end loop;

  return v_names;
end;
$$;

-- 6. Progres wali santri: capaian per item-ID (sinkron katalog) ----------------
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
    select a.student_id, a.student_name, ah.halaqah_name,
           ht.id as target_id, ht.category, ht.target_value,
           ht.scope, ht.items, ht.item_ids, ht.description,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
  ),
  progres as (
    select
      t.student_id, t.target_id,
      case
        -- Mode katalog (V54): capaian = item target yang sudah DINILAI/LULUS
        -- di penilaian dengan ID materi yang sama → sinkron dengan menu
        -- Tahfidz/Hadits/Doa, apa pun tanggal penilaiannya.
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
        -- Mode teks (data lama V38) & target jumlah polos (V17): hitung
        -- penilaian dalam periode cakupan — perilaku lama dipertahankan.
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
