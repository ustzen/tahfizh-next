-- ============================================================================
-- TAHFIZH V12.10 — Tambah/Hapus Materi langsung di menu Hadits & Doa Harian
-- ============================================================================
-- Menu Hadits & Doa kini sistemnya sama dengan Tugas/Tajwid: guru (dan
-- koordinator/admin) menambahkan materi langsung dari menu lewat tombol
-- "+ Tambah Materi" — materi jadi kolom penilaian di grid. Materi yang tidak
-- dipakai bisa dihapus (soft delete: is_active=false) langsung dari header
-- kolomnya. Penilaian tetap lewat RPC learning_save_grid yang sudah ada
-- (mode Centang/Huruf/Angka dipilih dari menu).
--
-- 1. RPC learning_material_create(p_module, p_title) — tambah materi modul
--    (HADITS → hadith_materials, DOA → daily_prayer_materials, TAJWID →
--    tajwid_materials). sort_order otomatis di belakang.
-- 2. RPC learning_material_delete(p_module, p_material) — nonaktifkan materi
--    (is_active=false); riwayat penilaian lama tetap tersimpan (append-only).
--
-- Keamanan: SECURITY DEFINER + verifikasi session → role USTADZ/KOORDINATOR/
-- ADMIN → tenant. Multi-tenant terisolasi. Idempoten: drop sebelum create.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC learning_material_create — tambah materi modul pembelajaran
-- ---------------------------------------------------------------------------
drop function if exists public.learning_material_create(text, text);

create or replace function public.learning_material_create(
  p_module text,
  p_title  text
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
  v_stable text;
  v_next   integer;
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
  if p_module not in ('HADITS', 'DOA', 'TAJWID') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;

  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) not between 1 and 160 then
    raise exception 'JUDUL_TIDAK_VALID';
  end if;

  v_stable := case p_module
    when 'HADITS' then 'hadith_materials'
    when 'DOA'    then 'daily_prayer_materials'
    else 'tajwid_materials'
  end;

  -- sort_order otomatis: belakang materi terakhir modul ini.
  execute format(
    'select coalesce(max(m.sort_order), 0) + 1 from public.%I m where m.tenant_id = $1',
    v_stable
  )
  using v_tenant
  into v_next;

  -- Idempoten-friendly: materi sudah ada (termasuk yang nonaktif) → aktifkan
  -- kembali & return id-nya, jangan duplikat (unique (tenant_id, title)).
  begin
    execute format(
      'insert into public.%I (tenant_id, created_by, title, sort_order, is_active)
       values ($1, $2, $3, $4, true)
       on conflict (tenant_id, title) do update
         set is_active = true,
             updated_at = now()
       returning id',
      v_stable
    )
    using v_tenant, v_uid, p_title, v_next
    into v_id;
  exception when others then
    raise exception 'JUDUL_TIDAK_VALID';
  end;

  return v_id;
end;
$$;

grant execute on function public.learning_material_create(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC learning_material_delete — nonaktifkan materi modul pembelajaran
--    (soft delete: is_active=false; riwayat penilaian tidak dihapus)
-- ---------------------------------------------------------------------------
drop function if exists public.learning_material_delete(text, uuid);

create or replace function public.learning_material_delete(
  p_module   text,
  p_material uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_stable text;
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
  if p_module not in ('HADITS', 'DOA', 'TAJWID') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;

  v_stable := case p_module
    when 'HADITS' then 'hadith_materials'
    when 'DOA'    then 'daily_prayer_materials'
    else 'tajwid_materials'
  end;

  execute format(
    'update public.%I m
        set is_active = false,
            updated_at = now()
      where m.id = $1
        and m.tenant_id = $2
        and m.is_active
      returning m.id',
    v_stable
  )
  using p_material, v_tenant
  into v_id;

  if v_id is null then
    raise exception 'MATERI_TIDAK_DITEMUKAN';
  end if;
end;
$$;

grant execute on function public.learning_material_delete(text, uuid) to authenticated;
