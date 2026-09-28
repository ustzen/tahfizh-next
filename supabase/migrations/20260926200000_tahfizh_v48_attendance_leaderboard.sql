-- ============================================================================
-- TAHFIZH V48 — RANGKUMAN PRESENSI: TOP RAJIN & TOP ALPA
-- ============================================================================
-- Menu "Riwayat Presensi" (menu terpisah di bawah Presensi) menambah dua
-- panel: 10 santri paling rajin (rasio hadir tertinggi) dan 10 santri paling
-- sering tidak hadir (alpa terbanyak, tie-break izin+sakit, lalu nama).
-- Satu RPC SECURITY DEFINER, guard identik attendance_day (V8).
--
-- Output: { rajin: [{studentId, studentName, studentCode, hadir, izin, sakit,
--          alpa, total, persen}], alpa: [...] }
-- Idempotent: create or replace + grant.
-- ============================================================================

create or replace function public.attendance_leaderboard(
  p_halaqah_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_teacher uuid := public.halaqah_current_teacher();
  v_role text;
begin
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  if not exists (
    select 1 from public.halaqahs
    where id = p_halaqah_id and tenant_id = v_tenant
  ) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;

  -- Guru hanya boleh halaqah yang diampu (sama seperti attendance_day V8).
  if v_role = 'USTADZ' and not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return jsonb_build_object(
    'rajin', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId', t.student_id, 'studentName', t.student_name,
        'studentCode', t.student_code, 'hadir', t.hadir,
        'izin', t.izin, 'sakit', t.sakit, 'alpa', t.alpa,
        'total', t.total, 'persen', t.persen
      ))
      from (
        select
          s.id as student_id,
          s.full_name as student_name,
          s.business_code as student_code,
          count(r.id) filter (where r.status = 'HADIR') as hadir,
          count(r.id) filter (where r.status = 'IZIN')  as izin,
          count(r.id) filter (where r.status = 'SAKIT') as sakit,
          count(r.id) filter (where r.status = 'ALPA')  as alpa,
          count(r.id) as total,
          coalesce(round(
            count(r.id) filter (where r.status = 'HADIR')::numeric
            / nullif(count(r.id), 0) * 100, 0), 0) as persen
        from public.halaqah_students hs
        join public.students s on s.id = hs.student_id
        left join public.attendance_records r
          on r.student_id = s.id
         and r.halaqah_id = p_halaqah_id
        where hs.halaqah_id = p_halaqah_id
          and hs.left_at is null
          and s.tenant_id = v_tenant
        group by s.id, s.full_name, s.business_code
        having count(r.id) > 0
        order by persen desc, hadir desc, s.full_name asc
        limit least(coalesce(p_limit, 10), 50)
      ) t
    ), '[]'::jsonb),
    'alpa', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId', t.student_id, 'studentName', t.student_name,
        'studentCode', t.student_code, 'hadir', t.hadir,
        'izin', t.izin, 'sakit', t.sakit, 'alpa', t.alpa,
        'total', t.total, 'persen', t.persen
      ))
      from (
        select
          s.id as student_id,
          s.full_name as student_name,
          s.business_code as student_code,
          count(r.id) filter (where r.status = 'HADIR') as hadir,
          count(r.id) filter (where r.status = 'IZIN')  as izin,
          count(r.id) filter (where r.status = 'SAKIT') as sakit,
          count(r.id) filter (where r.status = 'ALPA')  as alpa,
          count(r.id) as total,
          coalesce(round(
            count(r.id) filter (where r.status = 'HADIR')::numeric
            / nullif(count(r.id), 0) * 100, 0), 0) as persen
        from public.halaqah_students hs
        join public.students s on s.id = hs.student_id
        left join public.attendance_records r
          on r.student_id = s.id
         and r.halaqah_id = p_halaqah_id
        where hs.halaqah_id = p_halaqah_id
          and hs.left_at is null
          and s.tenant_id = v_tenant
        group by s.id, s.full_name, s.business_code
        having count(r.id) > 0
        order by alpa desc, (izin + sakit) desc, s.full_name asc
        limit least(coalesce(p_limit, 10), 50)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.attendance_leaderboard(uuid, integer) to authenticated;
