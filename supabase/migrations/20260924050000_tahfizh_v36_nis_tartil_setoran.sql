-- ============================================================================
-- TAHFIZH V36 — NIS LEMBAGA PADA MENU TARTIL & SETORAN GURU
-- ============================================================================
-- Lanjutan V30 (nis_lembaga_grid_guru): V30 sudah memperbaiki kolom "NIS" di
-- Presensi, Tahfidz, Hadits/Doa, Tajwid, dan Tugas agar memakai NIS lembaga
-- (students.nis) — bukan business_code (nomor ID web berawalan "S-").
--
-- Namun 2 RPC ini TERLEWAT dari V30 dan masih mengembalikan business_code:
--   1. tartil_teacher_summaries               (menu Tartil guru — dropdown
--                                               "Pilih Santri" di Jurnal Mengaji)
--   2. tahfidz_teacher_submission_summaries   (menu Setoran guru)
--
-- Perbaikan (hanya body fungsi, idempoten, signature TIDAK berubah — kolom
-- output tetap bernama `business_code` di RETURNS TABLE, tapi isinya kini
-- students.nis agar API/tipe TypeScript existing tidak perlu diubah level
-- SQL): santri tanpa NIS diisi null (frontend menampilkan "—").
-- Tidak ada perubahan tabel/RLS/data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tartil_teacher_summaries — kolom id santri = NIS lembaga.
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_teacher_summaries(uuid);

create or replace function public.tartil_teacher_summaries(p_teacher_id uuid)
returns table (
  student_id       uuid,
  business_code    text,
  full_name        text,
  gender           public.gender_type,
  student_status   public.entity_status,
  assessed_count   bigint,
  last_material    text,
  last_pages       text,
  last_score_label text,
  last_score_value integer,
  last_mode        public.tahfidz_mode,
  last_assessed_at timestamptz
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
  v_teacher uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role <> 'USTADZ' then raise exception 'AKSES_DITOLAK'; end if;

  -- Guru hanya boleh ringkasan miliknya sendiri (UUID dulu, fallback nama).
  v_teacher := public.current_teacher_id();
  if v_teacher is null then
    select t.id into v_teacher from public.teachers t
    where t.tenant_id = v_tenant
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc limit 1;
  end if;
  if v_teacher is null or v_teacher <> p_teacher_id then raise exception 'AKSES_DITOLAK'; end if;

  return query
  with binaan as (
    -- Jalur halaqah (utama) + teacher_students (data lama)
    select hs.student_id
    from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher
    union
    select ts.student_id
    from public.teacher_students ts
    where ts.teacher_id = v_teacher
  ),
  scored as (
    select a.student_id, count(*)::bigint as c
    from public.tartil_assessments a
    where a.deleted_at is null and a.status = 'DINILAI'
    group by a.student_id
  )
  -- V36: kolom NIS = NIS lembaga (students.nis), bukan nomor ID web.
  select s.id, nullif(btrim(s.nis), ''), s.full_name, s.gender, s.status,
         coalesce(sc.c, 0),
         last_a.material_name, last_a.pages_label,
         last_a.score_label, last_a.score_value,
         case when last_a.score_label is not null then 'HURUF'::public.tahfidz_mode
              when last_a.score_value is not null then 'ANGKA'::public.tahfidz_mode
              else null end,
         last_a.assessed_at
  from binaan b
  join public.students s on s.id = b.student_id and s.tenant_id = v_tenant
  left join scored sc on sc.student_id = s.id
  left join lateral (
    select distinct on (a.student_id)
      a.assessed_at, a.pages_label, a.score_label, a.score_value, m.name as material_name
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    where a.student_id = s.id and a.deleted_at is null
    order by a.student_id, a.assessed_at desc
  ) last_a on true
  order by s.full_name;
end;
$$;

grant execute on function public.tartil_teacher_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. tahfidz_teacher_submission_summaries (menu Setoran) — kolom id santri
--    = NIS lembaga.
-- ---------------------------------------------------------------------------
drop function if exists public.tahfidz_teacher_submission_summaries(uuid);

create or replace function public.tahfidz_teacher_submission_summaries(p_teacher_id uuid)
returns table (
  student_id        uuid,
  business_code     text,
  full_name         text,
  gender            public.gender_type,
  student_status    public.entity_status,
  submission_count  bigint,
  lulus_count       bigint,
  last_surah        text,
  last_ayat         text,
  last_kind         public.submission_kind,
  last_result       public.submission_result,
  last_score_label  text,
  last_score_value  integer,
  last_date         date
)
language sql
security definer set search_path = public
as $$
  with assigned as (
    -- V36: kolom NIS = NIS lembaga (students.nis), bukan nomor ID web.
    select s.id, nullif(btrim(s.nis), '') as business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  counts as (
    select
      sub.student_id,
      count(*) filter (where true)::bigint as submission_count,
      count(*) filter (where sub.result = 'LULUS')::bigint as lulus_count
    from public.tahfidz_submissions sub
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    group by sub.student_id
  ),
  latest as (
    select distinct on (sub.student_id)
      sub.student_id, sub.ayat_label, sub.kind, sub.result,
      sub.score_label, sub.score_value, sub.assessed_date,
      coalesce(ts.name_override, gs.name, 'Surat') as surah_name
    from public.tahfidz_submissions sub
    join public.tahfidz_tenant_surahs ts on ts.id = sub.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    order by sub.student_id, sub.assessed_date desc, sub.created_at desc
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(c.submission_count, 0),
    coalesce(c.lulus_count, 0),
    l.surah_name, l.ayat_label, l.kind, l.result, l.score_label, l.score_value, l.assessed_date
  from assigned a
  left join counts c on c.student_id = a.id
  left join latest l on l.student_id = a.id
  order by a.full_name;
$$;

grant execute on function public.tahfidz_teacher_submission_summaries(uuid) to authenticated;
