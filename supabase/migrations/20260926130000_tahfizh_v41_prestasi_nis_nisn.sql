-- ============================================================================
-- TAHFIZH V41 — santri_prestasi_card: tambah NIS & NISN lembaga
-- ============================================================================
-- Subtitle Kartu Prestasi harus menampilkan HALAQAH - NIS/NISN yang diinput
-- lembaga (students.nis / students.nisn), bukan nomor ID web students.business_code
-- (mis. "S-35"). Fungsi V18 di-recreate tanpa mengubah logika lain — hanya
-- anak CTE dan output jsonb yang ditambah kolom nis/nisn.
-- Idempotent: create or replace + grant.
-- ============================================================================

create or replace function public.santri_prestasi_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_tenant      uuid := public.santri_guard();
  v_total_surah integer;
  v_out         jsonb;
begin
  select count(*) into v_total_surah
  from public.tahfidz_tenant_surahs
  where tenant_id = v_tenant and is_active;

  with anak as (
    select s.id as student_id, s.full_name as student_name, s.business_code,
           s.nis, s.nisn
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
  ),
  halaqah as (
    select distinct on (hs.student_id)
      hs.student_id, h.name as halaqah_name
    from public.halaqah_students hs
    join public.halaqahs h on h.id = hs.halaqah_id
    join anak a on a.student_id = hs.student_id
    where hs.left_at is null
    order by hs.student_id, hs.joined_at desc
  ),
  nilai as (
    select a.student_id, x.modul, x.score_value, x.tgl, x.title
    from anak a
    join lateral (
      select 'TAHFIDZ'::text as modul, t.score_value, t.assessed_at::date as tgl,
             coalesce(ts.name_override, ms.name, 'Surat') as title
        from public.tahfidz_assessments t
        left join public.tahfidz_tenant_surahs ts on ts.id = t.tenant_surah_id
        left join public.tahfidz_surahs ms on ms.id = ts.surah_id
        where t.student_id = a.student_id and t.tenant_id = v_tenant and t.status = 'DINILAI'
      union all
      select 'TARTIL', t.score_value, t.assessed_at::date, coalesce(m.name, 'Materi Tartil')
        from public.tartil_assessments t
        left join public.tartil_materials m on m.id = t.material_id
        where t.student_id = a.student_id and t.tenant_id = v_tenant and t.deleted_at is null
      union all
      select l.module_type::text, l.score_value, l.assessed_date,
             coalesce(h.title, p2.title, tj.title, 'Materi')
        from public.learning_assessments l
        left join public.hadith_materials h on h.id = l.hadith_id
        left join public.daily_prayer_materials p2 on p2.id = l.prayer_id
        left join public.tajwid_materials tj on tj.id = l.tajwid_id
        where l.student_id = a.student_id and l.tenant_id = v_tenant and l.deleted_at is null
      union all
      select 'TUGAS', sc.score_value, sc.assessed_at::date, coalesce(tg.title, 'Tugas')
        from public.tugas_halaqah_scores sc
        left join public.tugas_halaqah tg on tg.id = sc.tugas_id
        where sc.student_id = a.student_id and sc.tenant_id = v_tenant
      union all
      select 'TAJWID', sc.score_value, sc.assessed_at::date, coalesce(tm.title, 'Materi Tajwid')
        from public.tajwid_materi_scores sc
        left join public.tajwid_materi tm on tm.id = sc.materi_id
        where sc.student_id = a.student_id and sc.tenant_id = v_tenant
      union all
      select 'SETORAN', sb.score_value, sb.assessed_date,
             coalesce(ts2.name_override, ms2.name, 'Surat')
        from public.tahfidz_submissions sb
        left join public.tahfidz_tenant_surahs ts2 on ts2.id = sb.tenant_surah_id
        left join public.tahfidz_surahs ms2 on ms2.id = ts2.surah_id
        where sb.student_id = a.student_id and sb.tenant_id = v_tenant and sb.deleted_at is null
    ) x on true
  ),
  per_modul as (
    select student_id, modul,
           count(*) as jml,
           round(avg(score_value) filter (where score_value is not null))::int as avg_score,
           max(tgl) as last_tgl,
           (array_agg(title order by tgl desc nulls last))[1] as last_title
    from nilai group by student_id, modul
  ),
  per_modul_json as (
    select student_id,
           jsonb_object_agg(modul, jsonb_build_object(
             'count', jml, 'avgScore', avg_score,
             'lastDate', last_tgl, 'lastTitle', last_title
           )) as obj
    from per_modul group by student_id
  ),
  agg as (
    select
      student_id,
      count(*)                                                     as total_penilaian,
      count(*) filter (where score_value is not null)              as ber_nilai,
      round(avg(score_value) filter (where score_value is not null))::int as avg_score,
      max(tgl)                                                     as last_tgl,
      count(*) filter (where modul = 'TAHFIDZ')                    as c_tahfidz,
      count(*) filter (where modul = 'TARTIL')                     as c_tartil,
      count(*) filter (where modul = 'HADITS')                     as c_hadits,
      count(*) filter (where modul = 'DOA')                        as c_doa,
      count(*) filter (where modul = 'TAJWID')                     as c_tajwid,
      count(*) filter (where modul = 'TUGAS')                      as c_tugas,
      count(*) filter (where modul = 'SETORAN')                    as c_setoran,
      count(*) filter (where tgl >= current_date - 30)             as c_30hari
    from nilai
    group by student_id
  ),
  hafalan as (
    select t.student_id, count(*) as surah_selesai
    from public.tahfidz_assessments t
    join anak a on a.student_id = t.student_id
    where t.tenant_id = v_tenant and t.status = 'DINILAI'
    group by t.student_id
  ),
  presensi as (
    select
      r.student_id,
      count(*)                                  as total,
      count(*) filter (where r.status = 'HADIR') as hadir,
      count(*) filter (where r.status = 'IZIN')  as izin,
      count(*) filter (where r.status = 'SAKIT') as sakit,
      count(*) filter (where r.status = 'ALPA')  as alpa
    from public.attendance_records r
    join anak a on a.student_id = r.student_id
    where r.tenant_id = v_tenant
    group by r.student_id
  ),
  apresiasi as (
    select distinct on (a.student_id)
      a.student_id, n.catatan, n.tgl
    from anak a
    join lateral (
      select t.free_note as catatan, t.assessed_at::date as tgl
        from public.tartil_assessments t
        where t.student_id = a.student_id and t.deleted_at is null
          and coalesce(t.free_note, '') <> ''
      union all
      select sb.free_note, sb.assessed_date
        from public.tahfidz_submissions sb
        where sb.student_id = a.student_id and sb.deleted_at is null
          and coalesce(sb.free_note, '') <> ''
      union all
      select l.free_note, l.assessed_date
        from public.learning_assessments l
        where l.student_id = a.student_id and l.deleted_at is null
          and coalesce(l.free_note, '') <> ''
    ) n on true
    order by a.student_id, n.tgl desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'studentId',      a.student_id,
        'studentName',    a.student_name,
        'businessCode',   a.business_code,
        'nis',            a.nis,
        'nisn',           a.nisn,
        'halaqahName',    hq.halaqah_name,
        'surahSelesai',   coalesce(hf.surah_selesai, 0),
        'surahTotal',     coalesce(v_total_surah, 0),
        'avgScore',       ag.avg_score,
        'totalPenilaian', coalesce(ag.total_penilaian, 0),
        'penilaian30Hari', coalesce(ag.c_30hari, 0),
        'lastAssessedAt', ag.last_tgl,
        'modules', jsonb_build_object(
          'TAHFIDZ', coalesce(ag.c_tahfidz, 0),
          'TARTIL',  coalesce(ag.c_tartil, 0),
          'HADITS',  coalesce(ag.c_hadits, 0),
          'DOA',     coalesce(ag.c_doa, 0),
          'TAJWID',  coalesce(ag.c_tajwid, 0),
          'TUGAS',   coalesce(ag.c_tugas, 0),
          'SETORAN', coalesce(ag.c_setoran, 0)
        ),
        'presensi', jsonb_build_object(
          'total', coalesce(pr.total, 0),
          'hadir', coalesce(pr.hadir, 0),
          'izin',  coalesce(pr.izin, 0),
          'sakit', coalesce(pr.sakit, 0),
          'alpa',  coalesce(pr.alpa, 0)
        ),
        'moduleStats', coalesce(pm.obj, '{}'::jsonb),
        'catatanApresiasi', ap.catatan
      ) order by a.student_name
    ), '[]'::jsonb)
  into v_out
  from anak a
  left join halaqah   hq on hq.student_id = a.student_id
  left join agg       ag on ag.student_id = a.student_id
  left join hafalan   hf on hf.student_id = a.student_id
  left join presensi  pr on pr.student_id = a.student_id
  left join per_modul_json pm on pm.student_id = a.student_id
  left join apresiasi ap on ap.student_id = a.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_prestasi_card() to authenticated;
