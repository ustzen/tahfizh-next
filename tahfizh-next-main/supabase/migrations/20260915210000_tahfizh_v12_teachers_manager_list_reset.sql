-- ============================================================================
-- TAHFIZH V12.5 — Data Guru via RPC + Reset Sandi di Form Edit (Guru/Santri)
-- ============================================================================
-- 1. RPC teachers_manager_list()
--    Menu Data Guru (Admin/Koordinator) sebelumnya membaca tabel teachers
--    langsung. Bila migration kolom baru (teachers.nickname /
--    teachers.login_username, 20260915200000) BELUM dijalankan di database,
--    query .select("... nickname ...") gagal dan tabel tampil KOSONG.
--    Solusinya paritas dengan Data Santri: RPC SECURITY DEFINER yang
--    men-select kolom secara AMAN (kolom baru hanya disertakan bila sudah
--    ada di skema), tenant-isolated, role ADMIN/KOORDINATOR/DEVELOPER.
--    Frontend tetap punya fallback query langsung bila RPC belum ada.
--
-- 2. RPC admin_force_reset_password_by_person(p_kind, p_person_id, p_password)
--    Reset password AKUN langsung dari form Edit Guru / Edit Santri di menu
--    Data Guru / Data Santri (tombol Reset Sandi di bagian bawah form).
--    Keamanan setara adminForceResetPasswordAction (V12.4):
--      - session wajib ADMIN lembaga (bukan dari client)
--      - target wajib satu tenant dengan admin
--      - hanya role WALI_SANTRI / USTADZ yang bisa direset lewat sini
--      - password di-hash Supabase Auth via service-role di server action;
--        RPC ini hanya MEMVERIFIKASI target & mengembalikan email akun,
--        sehingga tidak ada plaintext password yang menyentuh SQL.
--
-- Idempoten: drop+create ulang kedua RPC (aman rerun lintas versi).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC teachers_manager_list — daftar guru lembaga untuk menu Data Guru
-- ---------------------------------------------------------------------------
drop function if exists public.teachers_manager_list();

create or replace function public.teachers_manager_list()
returns table (
  id             uuid,
  business_code  text,
  full_name      text,
  nickname       text,
  login_username text,
  gender         public.gender_type,
  whatsapp       text,
  status         public.entity_status
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
  v_has_nickname       boolean;
  v_has_login_username boolean;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  -- Data Guru adalah menu kelola lembaga — role manajemen saja.
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Kolom V12.2 opsional: hanya dibaca bila skema sudah memilikinya,
  -- sehingga RPC tetap bekerja di database yang belum menjalankan
  -- migration 20260915200000 (penyebab tabel guru kosong sebelumnya).
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teachers'
      and column_name = 'nickname'
  ) into v_has_nickname;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teachers'
      and column_name = 'login_username'
  ) into v_has_login_username;

  return query
    select t.id, t.business_code, t.full_name,
           case when v_has_nickname then t.nickname else null end as nickname,
           case when v_has_login_username then t.login_username else null end as login_username,
           t.gender, t.whatsapp, t.status
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
    order by t.business_code;
end;
$$;

grant execute on function public.teachers_manager_list() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC admin_force_reset_password_by_person — verifikasi target reset
--    password akun guru/santri dari form Edit di menu Data Guru/Data Santri.
--    Server action (service-role) yang memanggil RPC ini yang benar-benar
--    mengubah password Supabase Auth — plaintext tidak pernah masuk SQL.
-- ---------------------------------------------------------------------------
create or replace function public.admin_force_reset_password_by_person(
  p_kind      text,
  p_person_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_profile uuid;
  v_email   text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'ADMIN' then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_kind not in ('teacher', 'student') then
    raise exception 'JENIS_TIDAK_DIKENAL';
  end if;

  -- Akun person: snapshot username di students/teachers → profiles.username.
  -- Target WAJIB satu tenant dengan admin; person tenant lain tidak terlihat.
  select p.id, u.email into v_profile, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('WALI_SANTRI', 'USTADZ')
    and p.tenant_id = v_tenant::uuid
    and p.username = (
      case p_kind
        when 'teacher' then (select t.login_username from public.teachers t
                             where t.id = p_person_id and t.tenant_id = v_tenant::uuid)
        else                (select s.login_username from public.students s
                             where s.id = p_person_id and s.tenant_id = v_tenant::uuid)
      end
    )
  limit 1;

  if v_profile is null then
    raise exception 'AKUN_TIDAK_DITEMUKAN';
  end if;

  return v_email;
end;
$$;

grant execute on function public.admin_force_reset_password_by_person(text, uuid) to authenticated;
