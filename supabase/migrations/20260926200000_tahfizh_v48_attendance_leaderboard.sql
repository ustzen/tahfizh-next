-- ============================================================================
-- TAHFIZH V48 — RANGKUMAN PRESENSI: TOP RAJIN & TOP ALPA
-- ============================================================================
-- Menu "Riwayat Presensi" (menu terpisah di bawah Presensi) menambah dua
-- panel: 10 santri paling rajin (rasio hadir tertinggi) dan 10 santri paling
-- sering tidak hadir (alpa terbanyak, tie-break izin+sakit, lalu nama).
-- Satu RPC SECURITY DEFINER, guard identik attendance_day (V8).
--
-- Fix revisi: agregat per santri dihitung SEKALI di CTE `agg` agar ORDER BY
-- boleh memakai ekspresi (izin + sakit) — versi sebelumnya memakai alias
-- output di dalam ekspresi ORDER BY sehingga RPC gagal dipanggil.
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
      with agg as (
        select
          s.id as student_id,
          s.full_name as student_name,
          s.business_code as student_code,
          count(r.id) filter (where r.status = 'HADIR') as hadir,
          count(r.id) filter (where r.status = 'IZIN')  as izin,
          count(r.id) filter (where r.status = 'SAKIT') as sakit,
          count(r.id) filter (where r.status = 'ALPA')  as alpa,
          count(r.id) as total
        from public.halaqah_students hs
        join public.students s on s.id = hs.student_id
        left join public.attendance_records r
          on r.student_id = s.id
         and r.halaqah_id = p_halaqah_id
        where hs.halaqah_id = p_halaqah_id
          and hs.left_at is null
          and s.tenant_id = v_tenant
        group by s.id
      )
      select jsonb_agg(
        jsonb_build_object(
          'studentId', a.student_id, 'studentName', a.student_name,
          'studentCode', a.student_code, 'hadir', a.hadir,
          'izin', a.izin, 'sakit', a.sakit, 'alpa', a.alpa,
          'total', a.total,
          'persen', coalesce(round(a.hadir::numeric / nullif(a.total, 0) * 100, 0), 0)
        ) order by
          (a.hadir::numeric / nullif(a.total, 0)) desc nulls last,
          a.hadir desc, a.student_name asc
      )
      from agg a
      where a.total > 0
    ), '[]'::jsonb),
    'alpa', coalesce((
      with agg as (
        select
          s.id as student_id,
          s.full_name as student_name,
          s.business_code as student_code,
          count(r.id) filter (where r.status = 'HADIR') as hadir,
          count(r.id) filter (where r.status = 'IZIN')  as izin,
          count(r.id) filter (where r.status = 'SAKIT') as sakit,
          count(r.id) filter (where r.status = 'ALPA')  as alpa,
          count(r.id) as total
        from public.halaqah_students hs
        join public.students s on s.id = hs.student_id
        left join public.attendance_records r
          on r.student_id = s.id
         and r.halaqah_id = p_halaqah_id
        where hs.halaqah_id = p_halaqah_id
          and hs.left_at is null
          and s.tenant_id = v_tenant
        group by s.id
      )
      select jsonb_agg(
        jsonb_build_object(
          'studentId', a.student_id, 'studentName', a.student_name,
          'studentCode', a.student_code, 'hadir', a.hadir,
          'izin', a.izin, 'sakit', a.sakit, 'alpa', a.alpa,
          'total', a.total,
          'persen', coalesce(round(a.hadir::numeric / nullif(a.total, 0) * 100, 0), 0)
        ) order by
          a.alpa desc, (a.izin + a.sakit) desc, a.student_name asc
      )
      from agg a
      where a.total > 0
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.attendance_leaderboard(uuid, integer) to authenticated;
