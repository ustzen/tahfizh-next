-- ============================================================================
-- TAHFIZH V55 — Guru bisa mengelola katalog acuan target
-- ============================================================================
-- Sebelumnya katalog (surah menu Tahfidz, hadits menu Hadits, doa menu Doa)
-- hanya dikelola ADMIN/KOORDINATOR. Guru yang membuat target sering butuh
-- menambah item baru saat menetapkan target — sekarang bisa langsung dari
-- menu Target guru (tanpa melewati admin):
--
--   • target_catalog_save(p_category, p_id, p_name, p_sort, p_active)
--       p_id NULL → tambah item baru; p_id terisi → ganti nama.
--       TAHFIDZ   → surah kustom lembaga (tahfidz_tenant_surahs dengan
--                   surah_id NULL + name_override).
--       HADITS/DOA → hadith_materials / daily_prayer_materials.
--   • target_catalog_toggle(p_id, p_category, p_active) — sembunyikan/tampilkan.
--   • target_catalog_delete(p_id, p_category) — hapus permanen (surah kustom
--     saja; karena unique(tenant,title) di tabel hadits/doa, hapus di sana
--     tidak memengaruhi penilaian lama yang sudah FK-restrict).
--
-- Semua RPC: USTADZ/KOORDINATOR/ADMIN, scope tenant dari profil pemanggil.
-- Duplikat nama pada hadits/doa ditolak database → error DUPLIKAT_KATALOG.
-- Idempoten: drop + create ulang.
-- ============================================================================

-- 0. Picker katalog: + is_active & opsi muat semua (untuk kelola) --------------
drop function if exists public.target_catalog_list(text);

drop function if exists public.target_catalog_list(text, boolean);

create or replace function public.target_catalog_list(p_category text, p_all boolean default false)
returns table (id uuid, name text, sort_order integer, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.name, k.sort_order, k.is_active
  from (
    select ts.id, coalesce(ts.name_override, m.name) as name, ts.sort_order, ts.is_active
    from public.tahfidz_tenant_surahs ts
    left join public.tahfidz_surahs m on m.id = ts.surah_id
    where ts.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    union all
    select hm.id, hm.title, hm.sort_order, hm.is_active
    from public.hadith_materials hm
    where hm.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    union all
    select dp.id, dp.title, dp.sort_order, dp.is_active
    from public.daily_prayer_materials dp
    where dp.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  ) k
  where ((p_category = 'TAHFIDZ' and exists (select 1 from public.tahfidz_tenant_surahs ts2 where ts2.id = k.id))
     or (p_category = 'HADITS' and exists (select 1 from public.hadith_materials h2 where h2.id = k.id))
     or (p_category = 'DOA'    and exists (select 1 from public.daily_prayer_materials d2 where d2.id = k.id)))
    and (p_all or k.is_active)
  order by k.sort_order, k.name;
$$;

grant execute on function public.target_catalog_list(text, boolean) to authenticated;

-- 1. Tambah / ganti nama item katalog ------------------------------------------
drop function if exists public.target_catalog_save(text, uuid, text, integer, boolean);

create or replace function public.target_catalog_save(
  p_category text,
  p_id       uuid default null,
  p_name     text default null,
  p_sort     integer default null,
  p_active   boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_name   text;
  v_sort   integer;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_category not in ('TAHFIDZ', 'HADITS', 'DOA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 160 then
    raise exception 'NAMA_TIDAK_VALID';
  end if;
  v_sort := coalesce(p_sort, 100);

  -- Ganti nama item yang sudah ada (harus milik lembaga ini).
  if p_id is not null then
    if p_category = 'TAHFIDZ' then
      update public.tahfidz_tenant_surahs ts
      set name_override = v_name, updated_at = now()
      where ts.id = p_id and ts.tenant_id = v_tenant
      returning ts.id into v_id;
    elsif p_category = 'HADITS' then
      update public.hadith_materials hm
      set title = v_name, updated_at = now()
      where hm.id = p_id and hm.tenant_id = v_tenant
      returning hm.id into v_id;
    else
      update public.daily_prayer_materials dp
      set title = v_name, updated_at = now()
      where dp.id = p_id and dp.tenant_id = v_tenant
      returning dp.id into v_id;
    end if;
    if v_id is null then
      raise exception 'ITEM_TIDAK_DITEMUKAN';
    end if;
    return v_id;
  end if;

  -- Item baru.
  if p_category = 'TAHFIDZ' then
    insert into public.tahfidz_tenant_surahs (tenant_id, surah_id, name_override, sort_order, is_active)
    values (v_tenant, null, v_name, v_sort, coalesce(p_active, true))
    returning id into v_id;
  elsif p_category = 'HADITS' then
    insert into public.hadith_materials (tenant_id, title, sort_order, is_active, created_by)
    values (v_tenant, v_name, v_sort, coalesce(p_active, true), v_uid)
    on conflict (tenant_id, title) do update set is_active = true, updated_at = now()
    returning id into v_id;
  else
    insert into public.daily_prayer_materials (tenant_id, title, sort_order, is_active, created_by)
    values (v_tenant, v_name, v_sort, coalesce(p_active, true), v_uid)
    on conflict (tenant_id, title) do update set is_active = true, updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.target_catalog_save(text, uuid, text, integer, boolean) to authenticated;

-- 2. Sembunyikan / tampilkan item ----------------------------------------------
drop function if exists public.target_catalog_toggle(uuid, text, boolean);

create or replace function public.target_catalog_toggle(p_id uuid, p_category text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_category = 'TAHFIDZ' then
    update public.tahfidz_tenant_surahs set is_active = p_active, updated_at = now()
    where id = p_id and tenant_id = v_tenant;
  elsif p_category = 'HADITS' then
    update public.hadith_materials set is_active = p_active, updated_at = now()
    where id = p_id and tenant_id = v_tenant;
  elsif p_category = 'DOA' then
    update public.daily_prayer_materials set is_active = p_active, updated_at = now()
    where id = p_id and tenant_id = v_tenant;
  else
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;
end;
$$;

grant execute on function public.target_catalog_toggle(uuid, text, boolean) to authenticated;

-- 3. Hapus permanen --------------------------------------------------------------
drop function if exists public.target_catalog_delete(uuid, text);

create or replace function public.target_catalog_delete(p_id uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_category = 'TAHFIDZ' then
    -- Hanya surah kustom lembaga (surah_id NULL); surah bawaan tak bisa dihapus.
    delete from public.tahfidz_tenant_surahs
    where id = p_id and tenant_id = v_tenant and surah_id is null;
  elsif p_category = 'HADITS' then
    delete from public.hadith_materials
    where id = p_id and tenant_id = v_tenant;
  elsif p_category = 'DOA' then
    delete from public.daily_prayer_materials
    where id = p_id and tenant_id = v_tenant;
  else
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;
end;
$$;

grant execute on function public.target_catalog_delete(uuid, text) to authenticated;
