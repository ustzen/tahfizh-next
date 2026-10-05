-- ============================================================================
-- TAHFIZH V60 — BRANDING LAYAR LOGIN (Pengaturan Developer)
-- ============================================================================
-- Fitur:
--   Developer dapat mengunggah logo & gambar hero (ilustrasi) yang tampil di
--   layar login /masuk — platform-wide (semua lembaga), menggantikan logo &
--   ilustrasi bawaan SVG.
-- Desain (selaras V39 menu-icons & V9 report-assets):
--   * Tabel `platform_settings` key-value (key='login') — nilai JSONB:
--       { "logo_path": "branding/…", "hero_path": "branding/…" | null }
--   * RLS AKTIF tanpa policy langsung (deny-all): baca hanya lewat helper
--     server service-role (data non-sensitif, halaman login anonim), tulis
--     hanya lewat RPC SECURITY DEFINER khusus DEVELOPER (defense in depth).
--   * Bucket publik `branding`: cukup getPublicUrl() tanpa signed URL;
--     unggahan hanya dari server action dengan service-role (klien tidak
--     pernah upload langsung), nama berkas acak — anti path-traversal.
--   * Batas ukuran & tipe ditegakkan app-side (actions/branding.ts).
-- Idempoten: aman dijalankan ulang.
-- ============================================================================

-- 1. Bucket storage publik untuk aset branding login
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

-- 2. Tabel pengaturan platform (key-value)
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_settings_key_check check (key in ('login')),
  constraint platform_settings_value_check check (jsonb_typeof(value) = 'object')
);

alter table public.platform_settings enable row level security;

-- Tanpa policy apa pun: klien (anon/authenticated) TIDAK bisa baca/tulis
-- langsung. Baca via helper server service-role; tulis via RPC di bawah.
drop policy if exists "platform_settings direct access denied" on public.platform_settings;
create policy "platform_settings direct access denied"
  on public.platform_settings for select to authenticated
  using (false);

-- 3. Simpan nilai pengaturan (khusus DEVELOPER)
--    Errors: AKSES_DITOLAK | KEY_TIDAK_VALID | NILAI_TIDAK_VALID
create or replace function public.platform_settings_save(
  p_key   text,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role <> 'DEVELOPER' then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_key is null or p_key <> 'login' then
    raise exception 'KEY_TIDAK_VALID';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'NILAI_TIDAK_VALID';
  end if;

  insert into public.platform_settings (key, value, updated_by)
  values (p_key, p_value, v_uid)
  on conflict (key) do update set
    value      = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

grant execute on function public.platform_settings_save(text, jsonb) to authenticated;
