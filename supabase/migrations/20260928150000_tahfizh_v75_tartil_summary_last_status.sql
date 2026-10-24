-- ============================================================================
-- TAHFIZH V75 — TARTIL SUMMARY: status penilaian terakhir
-- ============================================================================
-- Laporan guru: "di penilaian massal, 1 santri tersimpan, tetapi Nilai di menu
-- Tartil kembali strip (—)." Penyebab: daftar ringkasan (RPC
-- `tartil_teacher_summaries`) hanya mengembalikan skor huruf/angka. Penilaian
-- CENTANG (✓ Lancar) tersimpan tanpa skor — sah, tapi daftar menampilkannya
-- sebagai "—" padahal sudah dinilai. Penilaian "Belum/Dipelajari" juga sama.
--
-- Perbaikan: RPC ringkasan kini mengembalikan `last_status` (BELUM /
-- DIPELAJARI / DINILAI). UI menampilkan "✓ Lancar" bila nilai terakhir
-- DINILAI centang, dan "Dipelajari/Belum" bila last_status demikian.
--
-- Tidak ada perubahan skema tabel. Idempoten (drop + create). Data aman.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_class where relname = 'tartil_assessments' and relnamespace = 'public'::regnamespace)
     or not exists (select 1 from pg_class where relname = 'profiles' and relnamespace = 'public'::regnamespace) then
    raise exception 'SKEMA_BELUM_LENGKAP: tabel dasar migrasi awal tidak ditemukan (profiles=%, tartil_assessments=%). Jalankan seluruh migrasi supabase/migrations/ berurutan atau file supabase/tahfizh-combined.sql sebelum V75.',
      coalesce((select relname from pg_class where oid = to_regclass('public.profiles')), 'TIDAK ADA'),
      coalesce((select relname from pg_class where oid = to_regclass('public.tartil_assessments')), 'TIDAK ADA');
  end if;
end $$;

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
  last_assessed_at timestamptz,
  last_status      public.tahfidz_progress
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
  select s.id, s.business_code, s.full_name, s.gender, s.status,
         coalesce(sc.c, 0),
         last_a.material_name, last_a.pages_label,
         last_a.score_label, last_a.score_value,
         case when last_a.score_label is not null then 'HURUF'::public.tahfidz_mode
              when last_a.score_value is not null then 'ANGKA'::public.tahfidz_mode
              else null end,
         last_a.assessed_at,
         last_a.status
  from binaan b
  join public.students s on s.id = b.student_id and s.tenant_id = v_tenant
  left join scored sc on sc.student_id = s.id
  left join lateral (
    select distinct on (a.student_id)
      a.assessed_at, a.pages_label, a.score_label, a.score_value, m.name as material_name, a.status
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    where a.student_id = s.id and a.deleted_at is null
    order by a.student_id, a.assessed_at desc
  ) last_a on true
  order by s.full_name;
end;
$$;

revoke execute on function public.tartil_teacher_summaries(uuid) from public;
grant execute on function public.tartil_teacher_summaries(uuid) to authenticated;
