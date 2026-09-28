-- ============================================================================
-- TAHFIZH V50b — kolom "wali_last_online" di RPC daftar santri
-- ============================================================================
-- Melanjutkan V50: menu Data Santri menampilkan kapan akun wali terakhir
-- online (profiles.last_seen_at, di-update lewat RPC touch_last_seen).
--
-- Dua RPC diperluas (drop + create ulang karena return type berubah):
--   • students_manager_list  — admin/koordinator (semua santri lembaga)
--   • teacher_students_list  — ustadz (santri binaan)
--
-- Sumber status: akun wali yang terhubung ke santri lewat
-- guardian_students → guardians → profiles.last_seen_at, diambil terbaru
-- bila santri punya lebih dari satu wali. NULL = belum pernah login / tidak
-- ada akun wali. Tenant tetap terisolasi; SECURITY DEFINER setara sebelumnya.
-- ============================================================================

-- ---------------------------------------------------------------- students --
drop function if exists public.students_manager_list();

create or replace function public.students_manager_list()
returns table (
  id            uuid,
  business_code text,
  nis           text,
  nisn          text,
  full_name     text,
  nickname      text,
  gender        public.gender_type,
  status        public.entity_status,
  guardian_name     text,
  guardian_whatsapp text,
  login_username   text,
  halaqah_id    uuid,
  halaqah_name  text,
  wali_last_online timestamptz
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
           s.login_username, hs.halaqah_id, h.name,
           (select max(p.last_seen_at)
              from public.guardian_students gs
              join public.guardians g on g.id = gs.guardian_id
              join public.profiles p on p.id = g.profile_id
             where gs.student_id = s.id) as wali_last_online
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

-- ---------------------------------------------------------------- teacher ---
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
  halaqah_name      text,
  wali_last_online  timestamptz
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
           hs.halaqah_id, h.name,
           (select max(p.last_seen_at)
              from public.guardian_students gs
              join public.guardians g on g.id = gs.guardian_id
              join public.profiles p on p.id = g.profile_id
             where gs.student_id = s.id) as wali_last_online
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
