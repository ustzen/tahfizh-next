-- ============================================================================
-- TAHFIZH V12.2 — Nama Panggilan & Akun Otomatis (Santri + Guru)
-- ============================================================================
-- Aturan akun (permintaan V12.2):
--   Username = nama panggilan (dinormalisasi huruf kecil, alfanumerik).
--   Bila dipakai di seluruh sistem → panggilan+2, panggilan+3, dst. (zain →
--   zain2). Password = panggilan + "1234" (zain → zain1234) — berlaku untuk
--   santri DAN guru. Username unik GLOBAL (lintas lembaga) mengikuti index
--   profiles_username_key yang sudah ada.
--
-- Migration ini:
--   1. teachers.nickname  — sumber username otomatis guru (dari import kolom
--      C / form Tambah Guru).
--   2. teachers.login_username — snapshot username akun guru (paritas dengan
--      students.login_username) agar tabel Data Guru bisa menampilkannya.
--   3. resolve_login_email v2 — login via username kini juga bekerja untuk
--      akun guru/ustadz dengan EMAIL ASLI: username → profiles.username →
--      email sebenarnya dari auth.users (bukan lagi hanya email sintetis
--      santri). Email tetap tidak pernah bocor ke client — yang dikembalikan
--      hanya milik akun yang coba login, dan hanya bila username terdaftar.
--
-- Idempoten: add column if not exists, drop+create function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom teachers
-- ---------------------------------------------------------------------------
alter table public.teachers add column if not exists nickname text;
alter table public.teachers add column if not exists login_username text;

-- Username akun guru unik per lembaga (snapshot; sumber kebenaran tetap
-- profiles.username yang unik global).
create unique index if not exists teachers_login_username_key
  on public.teachers (tenant_id, lower(login_username))
  where login_username is not null;

create index if not exists teachers_tenant_nickname_idx
  on public.teachers (tenant_id, lower(nickname));

-- ---------------------------------------------------------------------------
-- 2. resolve_login_email v2 — dukung email asli (guru/ustadz) + sintetis
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_login_email(text);

create or replace function public.resolve_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(u.email, lower(btrim(p_username)) || '@santri.tahfizh.local')
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.username is not null
    and lower(btrim(p.username)) = lower(btrim(p_username))
  limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
