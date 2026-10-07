-- ============================================================================
-- TAHFIZH V63 — Urutan item target mengikuti urutan yang guru masukkan
-- ============================================================================
-- Masalah: target_halaqah_save() menyimpan item_ids dengan
--   array_agg(distinct x)  -- tanpa ORDER BY
-- DISTINCT pada agregat mengurutkan ulang nilai, sehingga urutan pilihan guru
-- hilang dan daftar surat di dasbor santri tampak acak. V62 sempat mengurutkan
-- menurut katalog, tetapi guru justru ingin urutannya sesuai yang ia masukkan.
--
-- Perbaikan:
--   1. target_halaqah_save() — dedup TANPA mengubah urutan: ambil kemunculan
--      pertama tiap ID (distinct on) lalu agregat kembali menurut ordinal.
--   2. target_item_names() — kembalikan nama mengikuti urutan `item_ids`
--      (urutan guru), bukan urutan katalog. Karena `items` & `itemStatus`
--      (V61) memakai fungsi ini, keduanya sejajar.
--
-- Idempoten: drop + create ulang. Tidak mengubah data/penilaian. Target lama
-- yang sudah tersimpan dalam urutan acak tidak dapat dipulihkan; setel ulang
-- target untuk memperbaikinya.
-- ============================================================================

-- 1. Nama item mengikuti urutan item_ids (urutan guru) -----------------------
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
    return null;
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

grant execute on function public.target_item_names(text, uuid[]) to authenticated;

-- 2. Simpan target: dedup tanpa mengubah urutan guru -------------------------
drop function if exists public.target_halaqah_save(uuid, text, text, uuid[], text);

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

  -- V63 — dedup + buang null TANPA mengubah urutan: kemunculan pertama tiap
  -- ID dipertahankan (distinct on), lalu diagregat kembali menurut ordinal.
  -- Wajib minimal 1 dan maksimal 500 item.
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
