-- ============================================================================
-- TAHFIZH V87 — Riwayat nilai Tartil untuk role santri/wali
-- ============================================================================
-- Ubin Tartil di Kartu Prestasi bisa diklik -> tabel daftar nilai (tanggal,
-- materi, halaman, nilai, status, ustadz, catatan).
-- RLS tartil_assessments sengaja tidak mengizinkan WALI_SANTRI membaca langsung,
-- jadi dibuat RPC SECURITY DEFINER yang hanya mengembalikan anak milik akun ini
-- (guardian_students) di tenant-nya sendiri. Baris yang dihapus (soft-delete)
-- tidak ikut. Idempotent.
-- ============================================================================

drop function if exists public.santri_tartil_riwayat(uuid, integer);

create or replace function public.santri_tartil_riwayat(
  p_student_id uuid default null,
  p_limit      integer default 300
)
returns table (
  r_student_id  uuid,
  r_id          uuid,
  r_assessed_at timestamptz,
  r_material    text,
  r_jilid       text,
  r_pages       text,
  r_status      text,
  r_score_value numeric,
  r_score_label text,
  r_teacher     text,
  r_catatan     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
begin
  return query
  select
    a.student_id,
    a.id,
    a.assessed_at,
    m.name::text,
    m.jilid::text,
    a.pages_label::text,
    a.status::text,
    a.score_value::numeric,
    a.score_label::text,
    t.full_name::text,
    coalesce(
      nullif(btrim(a.free_note), ''),
      (select string_agg(n.content, ' · ' order by n.created_at)
         from public.tartil_assessment_notes n
        where n.assessment_id = a.id)
    )::text
  from public.tartil_assessments a
  join public.tartil_materials m on m.id = a.material_id
  left join public.teachers t on t.id = a.teacher_id
  where a.tenant_id = v_tenant
    and a.deleted_at is null
    and a.student_id in (
      select gs.student_id
      from public.guardian_students gs
      join public.guardians g on g.id = gs.guardian_id
      where g.profile_id = v_uid
    )
    and (p_student_id is null or a.student_id = p_student_id)
  order by a.assessed_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 1000));
end;
$$;

revoke execute on function public.santri_tartil_riwayat(uuid, integer) from public;
grant execute on function public.santri_tartil_riwayat(uuid, integer) to authenticated;
