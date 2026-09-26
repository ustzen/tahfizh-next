-- ============================================================================
-- TAHFIZH V39 — IKON MENU KUSTOM (Pengaturan Developer)
-- ============================================================================
-- Fitur:
--   Developer dapat mengganti ikon tiap menu (nav, menu cepat, menu bawah)
--   dari dua sumber:
--     1. PHOSPHOR — pilih dari katalog Phosphor Icons (@phosphor-icons/react).
--     2. CUSTOM  — unggah gambar sendiri (PNG/JPG/SVG/WebP, maks 512 KB,
--        disimpan di bucket publik `menu-icons`).
-- Desain:
--   * Ikon menu adalah tampilan PLATFORM-WIDE (berlaku untuk seluruh web,
--     semua lembaga), jadi tabel TIDAK tenant-scoped dan hanya role
--     DEVELOPER yang boleh mengubahnya (via RPC SECURITY DEFINER).
--   * `menu_key` = NavKey (terminology-shared) atau key Menu Cepat
--     (quick-menu.ts) — keduanya berbagi namespace yang sama.
--   * Icon default (lucide) dipakai bila tidak ada baris — tidak perlu seeding.
--   * RLS tetap AKTIF tanpa policy langsung: tabel hanya boleh disentuh
--     lewat RPC SECURITY DEFINER (defense in depth, pola rule #24/#29).
--   * Bucket publik: cukup getPublicUrl() tanpa signed URL; unggah file hanya
--     dari API route dengan service-role (klien tidak pernah upload langsung).
-- Idempoten: aman dijalankan ulang.
-- ============================================================================

-- 1. Bucket storage publik (maks 512 KB & tipe gambar ditegakkan app-side)
insert into storage.buckets (id, name, public)
values ('menu-icons', 'menu-icons', true)
on conflict (id) do update set public = true;

-- 2. Tabel ikon menu (platform-wide, hanya DEVELOPER)
create table if not exists public.menu_icons (
  id           uuid primary key default gen_random_uuid(),
  menu_key     text not null,
  icon_kind    text not null default 'PHOSPHOR',
  icon_name    text,
  storage_path text,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (menu_key),
  constraint menu_icons_kind_check check (icon_kind in ('PHOSPHOR', 'CUSTOM')),
  constraint menu_icons_key_check check (
    char_length(menu_key) between 1 and 60
    and menu_key ~ '^[a-z0-9_-]+$'
  ),
  constraint menu_icons_name_check check (
    icon_kind <> 'PHOSPHOR' or (
      icon_name is not null
      and char_length(icon_name) between 1 and 80
      and icon_name ~ '^[A-Za-z0-9]+$'
    )
  ),
  constraint menu_icons_path_check check (
    icon_kind <> 'CUSTOM' or (
      storage_path is not null
      and char_length(storage_path) between 1 and 400
    )
  )
);

alter table public.menu_icons enable row level security;

-- Tanpa policy apa pun: klien (anon/authenticated) TIDAK bisa baca/tulis
-- langsung. Baca hanya lewat helper server + tulis lewat RPC di bawah.
drop policy if exists "menu_icons direct access denied" on public.menu_icons;
create policy "menu_icons direct access denied"
  on public.menu_icons for select to authenticated
  using (false);

-- 3. Baca seluruh override (server-side rendering; data non-sensitif)
create or replace function public.menu_icons_all()
returns table (
  menu_key     text,
  icon_kind    text,
  icon_name    text,
  storage_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select mi.menu_key, mi.icon_kind, mi.icon_name, mi.storage_path
  from public.menu_icons mi
  order by mi.menu_key
$$;

grant execute on function public.menu_icons_all() to authenticated;

-- 4. Simpan ikon PHOSPHOR untuk satu menu (khusus DEVELOPER)
--    Errors: AKSES_DITOLAK | MENU_KEY_TIDAK_VALID | NAMA_IKON_TIDAK_VALID
drop function if exists public.menu_icon_save(uuid, text, text, text);
create or replace function public.menu_icon_save(
  p_menu_key  text,
  p_icon_kind text,
  p_icon_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_menu_key is null or p_menu_key !~ '^[a-z0-9_-]{1,60}$' then
    raise exception 'MENU_KEY_TIDAK_VALID';
  end if;
  if p_icon_kind not in ('PHOSPHOR', 'CUSTOM') then
    raise exception 'MENU_KEY_TIDAK_VALID';
  end if;

  if p_icon_kind = 'PHOSPHOR' then
    if p_icon_name is null or p_icon_name !~ '^[A-Za-z0-9]{1,80}$' then
      raise exception 'NAMA_IKON_TIDAK_VALID';
    end if;
    insert into public.menu_icons
      (menu_key, icon_kind, icon_name, storage_path, created_by, updated_by)
    values
      (p_menu_key, 'PHOSPHOR', p_icon_name, null, v_uid, v_uid)
    on conflict (menu_key) do update set
      icon_kind    = excluded.icon_kind,
      icon_name    = excluded.icon_name,
      storage_path = null,
      updated_by   = excluded.updated_by,
      updated_at   = now();
  else
    -- CUSTOM: path berkas sudah diunggah service-role dari API route.
    if p_icon_name is null
       or p_icon_name !~ '^menu-icons/[a-z0-9][a-z0-9_-]{0,59}\.[A-Za-z0-9]{2,5}$' then
      raise exception 'PATH_IKON_TIDAK_VALID';
    end if;
    insert into public.menu_icons
      (menu_key, icon_kind, icon_name, storage_path, created_by, updated_by)
    values
      (p_menu_key, 'CUSTOM', p_icon_name, p_icon_name, v_uid, v_uid)
    on conflict (menu_key) do update set
      icon_kind    = excluded.icon_kind,
      icon_name    = excluded.icon_name,
      storage_path = excluded.storage_path,
      updated_by   = excluded.updated_by,
      updated_at   = now();
  end if;
end;
$$;

grant execute on function public.menu_icon_save(text, text, text) to authenticated;

-- 5. Reset ikon satu menu ke bawaan (hapus baris + berkas custom via service-role)
--    Errors: AKSES_DITOLAK | MENU_KEY_TIDAK_VALID
create or replace function public.menu_icon_reset(p_menu_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_path text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_menu_key is null or p_menu_key !~ '^[a-z0-9_-]{1,60}$' then
    raise exception 'MENU_KEY_TIDAK_VALID';
  end if;

  delete from public.menu_icons
  where menu_key = p_menu_key
  returning storage_path into v_path;

  return v_path;
end;
$$;

grant execute on function public.menu_icon_reset(text) to authenticated;

-- 6. Reset SEMUA ikon ke bawaan; mengembalikan daftar path custom yang
--    harus dihapus service-role.
create or replace function public.menu_icon_reset_all()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_paths text[];
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;

  with deleted as (
    delete from public.menu_icons
    where storage_path is not null
    returning storage_path
  )
  select coalesce(array_agg(d.storage_path), '{}'::text[]) into v_paths
  from (select storage_path from deleted) d;

  return v_paths;
end;
$$;

grant execute on function public.menu_icon_reset_all() to authenticated;
