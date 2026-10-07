-- ============================================================================
-- TAHFIZH V64 — Rekap presensi santri: sediakan seluruh catatan dalam periode
-- ============================================================================
-- Kebutuhan: halaman Presensi (santri) punya pemilih bulan; daftar "Detail
-- Kehadiran" harus mengikuti bulan yang dipilih. Sebelumnya RPC hanya
-- mengembalikan 10 pertemuan terakhir (`recent`), sehingga bulan lama kosong.
--
-- Perubahan: tambah field `records` = SELURUH catatan presensi dalam periode
-- (maks 1000, terbaru dulu). `summary`, `months`, dan `recent` tidak berubah
-- (kompatibel mundur). Idempoten: drop + create ulang; data tidak diubah.
-- ============================================================================

drop function if exists public.santri_presensi_rekap(integer);

create or replace function public.santri_presensi_rekap(p_months integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
  v_months integer := least(greatest(coalesce(p_months, 6), 1), 24);
  v_since  date;
  v_out    jsonb;
begin
  v_since := date_trunc('month', current_date)::date - ((v_months - 1) || ' months')::interval;

  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
  ),
  rec as (
    select a.student_id, a.student_name, r.status::text as status,
           r.note, se.session_date, h.name as halaqah_name
    from public.attendance_records r
    join anak a on a.student_id = r.student_id
    join public.attendance_sessions se on se.id = r.session_id
    left join public.halaqahs h on h.id = r.halaqah_id
    where r.tenant_id = v_tenant and se.session_date >= v_since
  ),
  per_bulan as (
    select student_id,
           to_char(session_date, 'YYYY-MM') as ym,
           min(session_date) as anchor,
           count(*) as total,
           count(*) filter (where status = 'HADIR') as hadir,
           count(*) filter (where status = 'IZIN')  as izin,
           count(*) filter (where status = 'SAKIT') as sakit,
           count(*) filter (where status = 'ALPA')  as alpa
    from rec group by student_id, to_char(session_date, 'YYYY-MM')
  ),
  total as (
    select student_id,
           count(*) as total,
           count(*) filter (where status = 'HADIR') as hadir,
           count(*) filter (where status = 'IZIN')  as izin,
           count(*) filter (where status = 'SAKIT') as sakit,
           count(*) filter (where status = 'ALPA')  as alpa
    from rec group by student_id
  ),
  terakhir as (
    select student_id, jsonb_agg(jsonb_build_object(
             'date', session_date, 'status', status,
             'note', note, 'halaqahName', halaqah_name
           ) order by session_date desc) as items
    from (
      select *, row_number() over (partition by student_id order by session_date desc) as rn
      from rec
    ) z where rn <= 10
    group by student_id
  ),
  -- V64 — seluruh catatan periode (untuk pemilih bulan di halaman Presensi).
  semua as (
    select student_id, jsonb_agg(jsonb_build_object(
             'date', session_date, 'status', status,
             'note', note, 'halaqahName', halaqah_name
           ) order by session_date desc) as items
    from (
      select *, row_number() over (partition by student_id order by session_date desc) as rn
      from rec
    ) z where rn <= 1000
    group by student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   a.student_id,
           'studentName', a.student_name,
           'summary', jsonb_build_object(
             'total', coalesce(t.total, 0), 'hadir', coalesce(t.hadir, 0),
             'izin',  coalesce(t.izin, 0),  'sakit', coalesce(t.sakit, 0),
             'alpa',  coalesce(t.alpa, 0)
           ),
           'months', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'ym', pb.ym, 'anchor', pb.anchor, 'total', pb.total,
                      'hadir', pb.hadir, 'izin', pb.izin,
                      'sakit', pb.sakit, 'alpa', pb.alpa
                    ) order by pb.ym desc)
             from per_bulan pb where pb.student_id = a.student_id
           ), '[]'::jsonb),
           'recent',  coalesce(tk.items, '[]'::jsonb),
           'records', coalesce(sm.items, '[]'::jsonb)
         ) order by a.student_name), '[]'::jsonb)
  into v_out
  from anak a
  left join total t     on t.student_id = a.student_id
  left join terakhir tk on tk.student_id = a.student_id
  left join semua sm    on sm.student_id = a.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_presensi_rekap(integer) to authenticated;
