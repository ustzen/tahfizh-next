-- ============================================================================
-- TAHFIZH V12.1 — Akun Login Santri + Data Santri di Dashboard Guru
-- ============================================================================
-- 1. AKUN LOGIN SANTRI
--    Admin/Koordinator dapat memberi username + password saat menambah santri
--    di menu Data Santri. Akun memakai role 'WALI_SANTRI' (enum lama tidak
--    boleh diubah; label UI V12 sudah menampilkan "Santri", routing /santri,
--    dashboard + force-change-password sudah siap untuk role ini).
--    Profile terhubung ke santri via students.login_username (snapshot agar
--    tabel Data Santri bisa menampilkan username tanpa join auth).
--
--    Keamanan: pembuatan user TIDAK dilakukan dari client — action server
--    memakai service-role (createAdminClient) SETELAH verifikasi session
--    ADMIN/KOORDINATOR. Password disimpan oleh Supabase Auth (bukan plaintext).
--    must_change_password = true mewajibkan ganti password saat login pertama.
--
-- 2. DATA SANTRI DI DASHBOARD GURU
--    RPC teacher_students_list diperluas mengembalikan kolom lengkap yang sama
--    dengan menu Data Santri (NIS/NISN/panggilan/wali/WA + halaqah) — guru
--    hanya melihat santri binaannya (tanpa data wali agar kontak tetap
--    terkonsentrasi di admin/koordinator... TIDAK: guru butuh WA wali untuk
--    komunikasi, jadi kolom wali juga dikembalikan).
--
-- Idempoten: add column if not exists, drop+create ulang RPC, DO-blok enum.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom login_username pada students (snapshot username akun santri)
-- ---------------------------------------------------------------------------
alter table public.students add column if not exists login_username text;

create unique index if not exists students_login_username_key
  on public.students (tenant_id, lower(login_username))
  where login_username is not null;

-- ---------------------------------------------------------------------------
-- 3. RPC teacher_students_list — kolom lengkap untuk tabel di dashboard guru
--    (nama, panggilan, NIS, NISN, gender, status, wali, WA wali, halaqah)
-- ---------------------------------------------------------------------------
drop function if exists public.teacher_students_list();

create or replace function public.teacher_students_list()
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
  halaqah_id        uuid,
  halaqah_name      text
)
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
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Resolusi teacher dari nama profil (pola yang sama dengan modul lain).
  if v_role = 'USTADZ' then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
    if v_teacher is null then
      return;
    end if;
  end if;

  return query
    select s.id, s.business_code, s.nis, s.nisn, s.full_name, s.nickname,
           s.gender, s.status, s.guardian_name, s.guardian_whatsapp,
           hs.halaqah_id, h.name
    from public.students s
    left join lateral (
      select h0.halaqah_id
      from public.halaqah_students h0
      where h0.student_id = s.id and h0.left_at is null
      limit 1
    ) hs on true
    left join public.halaqahs h on h.id = hs.halaqah_id
    where s.tenant_id = v_tenant::uuid
      and (v_role <> 'USTADZ' or exists (
        select 1 from public.halaqah_teachers ht
        join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
        where ht.teacher_id = v_teacher and h1.student_id = s.id
      ))
    order by s.business_code;
end;
$$;

grant execute on function public.teacher_students_list() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC resolve_login_email — mendukung LOGIN VIA USERNAME
--    profiles dilindungi RLS (select_own/select_tenant), sehingga pengunjung
--    yang BELUM LOGIN tidak bisa membaca profiles langsung (lookup anon selalu
--    kosong). RPC SECURITY DEFINER ini hanya memverifikasi bahwa username
--    benar-benar terdaftar, lalu mengembalikan email sintetis akun santri
--    ({username}@santri.tahfizh.local — tidak pernah menerima surat; identitas
--    login Supabase saja). Email pribadi pengguna lain tidak pernah bocor.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p_username || '@santri.tahfizh.local'
  where exists (
    select 1 from public.profiles p
    where lower(btrim(p.username)) = lower(btrim(p_username))
  );
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
