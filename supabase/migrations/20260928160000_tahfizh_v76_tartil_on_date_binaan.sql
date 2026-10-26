-- ============================================================================
-- TAHFIZH V76 — TARTIL: nilai pada tanggal tertentu (form massal) lebih andal
-- ============================================================================
-- Laporan guru: "sudah menilai 1 santri, tetapi saat memilih tanggal itu lagi
-- semua santri tampil Belum dinilai."
--
-- Perbaikan: `tartil_assessments_on_date` kini
--   * mengambil penilaian untuk SEMUA santri binaan guru (jalur halaqah +
--     teacher_students) pada tanggal WIB itu — tidak lagi mensyaratkan
--     `teacher_id` baris penilaian sama persis dengan guru yang login, sehingga
--     nilai yang tersimpan lewat jalur lain / guru ganda tetap terbaca;
--   * tidak melempar GURU_TIDAK_DITEMUKAN bila link guru belum ada
--     (fallback nama, lalu hasil kosong yang jelas).
-- Tidak ada perubahan skema. Idempoten (drop + create).
-- ============================================================================

drop function if exists public.tartil_assessments_on_date(date);

create or replace function public.tartil_assessments_on_date(p_date date)
returns table (
  student_id    uuid,
  material_id   uuid,
  pages_label   text,
  status        public.tahfidz_progress,
  score_value   integer,
  score_label   text,
  free_note     text,
  assessment_id uuid
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
  v_name    text;
  v_teacher uuid;
begin
  select p.tenant_id, p.role::text, p.full_name into v_tenant, v_role, v_name
  from public.profiles p where p.id = v_uid;
  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select t.id into v_teacher from public.teachers t
    where t.tenant_id = v_tenant and t.profile_id = v_uid
    order by t.created_at desc limit 1;
  if v_teacher is null then
    select t.id into v_teacher from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim(v_name))
      order by t.created_at desc limit 1;
  end if;

  return query
  with binaan as (
    select hs.student_id as sid
    from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher
    union
    select ts.student_id as sid
    from public.teacher_students ts
    where ts.teacher_id = v_teacher
  )
  select a.student_id, a.material_id, a.pages_label, a.status,
         a.score_value, a.score_label, a.free_note, a.id
  from public.tartil_assessments a
  where a.tenant_id = v_tenant
    and a.deleted_at is null
    and (a.assessed_at at time zone 'Asia/Jakarta')::date = p_date
    and (
      a.teacher_id = v_teacher
      or a.assessed_by = v_uid
      or a.student_id in (select b.sid from binaan b)
    )
  order by a.assessed_at desc;
end;
$$;

revoke execute on function public.tartil_assessments_on_date(date) from public;
grant execute on function public.tartil_assessments_on_date(date) to authenticated;
