-- ============================================================================
-- TAHFIZH V47 — RIWAYAT PRESENSI TERPAGINASI
-- ============================================================================
-- Menu Presensi guru menambah tabel riwayat presensi per tanggal (10 sesi
-- per halaman). Satu RPC SECURITY DEFINER dengan guard identik attendance_day
-- (V8): tenant dicek, USTADZ harus pengampu halaqah terkait.
--
-- Output: { total, rows: [{ date, hadir, izin, sakit, alpa, total }] }
-- Diurut terbaru dulu; halaman dihitung dari offset (page*10).
-- Idempotent: create or replace + drop policy n/a (function only) + grant.
-- ============================================================================

create or replace function public.attendance_history_page(
  p_halaqah_id uuid,
  p_limit  integer default 10,
  p_offset integer default 0
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
  v_total integer;
begin
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  if not exists (
    select 1 from public.halaqahs
    where id = p_halaqah_id and tenant_id = v_tenant
  ) then
    raise exception 'HALAQAH_TIDAK_DITEMUKAN';
  end if;

  -- Guru hanya boleh melihat halaqah yang diampu (sama seperti attendance_day).
  if v_role = 'USTADZ' and not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;

  select count(distinct s.session_date) into v_total
  from public.attendance_sessions s
  where s.halaqah_id = p_halaqah_id;

  return jsonb_build_object(
    'total', v_total,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.session_date,
        'hadir', d.hadir,
        'izin', d.izin,
        'sakit', d.sakit,
        'alpa', d.alpa,
        'total', d.total
      ) order by d.session_date desc)
      from (
        select s.session_date,
               count(r.id) filter (where r.status = 'HADIR') as hadir,
               count(r.id) filter (where r.status = 'IZIN')  as izin,
               count(r.id) filter (where r.status = 'SAKIT') as sakit,
               count(r.id) filter (where r.status = 'ALPA')  as alpa,
               count(r.id) as total
        from public.attendance_sessions s
        left join public.attendance_records r on r.session_id = s.id
        where s.halaqah_id = p_halaqah_id
        group by s.session_date
        order by s.session_date desc
        limit least(coalesce(p_limit, 10), 50)
        offset greatest(coalesce(p_offset, 0), 0)
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.attendance_history_page(uuid, integer, integer) to authenticated;
