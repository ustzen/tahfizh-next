-- ============================================================================
-- TAHFIZH V12 — Data Santri lengkap: NIS, NISN, Nama Wali, No. WA Wali
-- ============================================================================
-- Kolom tabel Data Santri kini = kolom contoh import:
--   NIS | NISN | Nama Lengkap | Nama Panggilan | Jenis Kelamin | Halaqah |
--   Nama Wali | No. WhatsApp Wali
--
-- Sebelumnya, import Excel menerima kolom NIS/NISN/Nama Wali/WA Wali tetapi
-- nilainya dibuang (void) karena kolomnya belum ada di database. Migration
-- ini menambahkan kolom data induk pada public.students:
--   * nis                — Nomor Induk Santri (milik lembaga, teks; boleh
--                          diawali 0 → tidak boleh numerik)
--   * nisn               — Nomor Induk Siswa Nasional (teks 10 digit)
--   * guardian_name      — snapshot nama wali dari data induk
--   * guardian_whatsapp  — snapshot nomor WhatsApp wali
--
-- Kolom ini adalah FAKTA DATA INDUK (diisi admin/koordinator lewat form atau
-- import), dipisahkan dari profil akun login wali (guardians/profiles) yang
-- tetap dikelola sistem akun V12. Tidak ada policy/RLS baru yang melemahkan
-- isolasi tenant; kolom mengikuti RLS students yang sudah ada.
--
-- RPC students_manager_list diperluas mengembalikan kolom baru agar menu
-- Data Santri (ADMIN/KOORDINATOR) menampilkan seluruhnya.
--
-- Idempoten: add column if not exists + drop/create ulang RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom data induk santri
-- ---------------------------------------------------------------------------
alter table public.students add column if not exists nis text;
alter table public.students add column if not exists nisn text;
alter table public.students add column if not exists guardian_name text;
alter table public.students add column if not exists guardian_whatsapp text;

-- Batasan format ringan (idempoten; aman untuk data yang sudah ada):
-- NIS maks 30 karakter, NISN 10 karakter digit bila diisi.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_nis_len_check'
  ) then
    alter table public.students
      add constraint students_nis_len_check check (nis is null or char_length(nis) <= 30);
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_nisn_format_check'
  ) then
    alter table public.students
      add constraint students_nisn_format_check check (nisn is null or nisn ~ '^[0-9]{10}$');
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_guardian_whatsapp_check'
  ) then
    alter table public.students
      add constraint students_guardian_whatsapp_check
      check (guardian_whatsapp is null or guardian_whatsapp ~ '^\+?[0-9]{8,15}$');
  end if;
end $$;

-- Unik per lembaga bila diisi (NULL tidak dibatasi) — NIS/NISN identik di
-- dalam satu lembaga hampir pasti salah ketik.
create unique index if not exists students_tenant_nis_key
  on public.students (tenant_id, nis) where nis is not null;
create unique index if not exists students_tenant_nisn_key
  on public.students (tenant_id, nisn) where nisn is not null;

-- ---------------------------------------------------------------------------
-- 2. RPC students_manager_list — tambah nis, nisn, guardian_name, guardian_whatsapp
-- ---------------------------------------------------------------------------
drop function if exists public.students_manager_list();

create or replace function public.students_manager_list()
returns table (
  id                uuid,
  business_code     text,
  nis               text,
  nisn              text,
  full_name         text,
  nickname          text,
  gender            public.gender_type,
  status            public.entity_status,
  guardian_name     text,
  guardian_whatsapp text,
  login_username    text,
  halaqah_id        uuid,
  halaqah_name      text
)
language plpgsql
stable
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

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return query
    select s.id, s.business_code, s.nis, s.nisn, s.full_name, s.nickname,
           s.gender, s.status, s.guardian_name, s.guardian_whatsapp,
           s.login_username, hs.halaqah_id, h.name
    from public.students s
    left join lateral (
      select h0.halaqah_id
      from public.halaqah_students h0
      where h0.student_id = s.id and h0.left_at is null
      limit 1
    ) hs on true
    left join public.halaqahs h on h.id = hs.halaqah_id
    where s.tenant_id = v_tenant::uuid
    order by s.business_code;
end;
$$;

grant execute on function public.students_manager_list() to authenticated;
