-- ============================================================================
-- TAHFIZH V18 — PANTAUAN SANTRI
--
-- Dasbor santri (role DB: WALI_SANTRI) sebelumnya hanya punya blok ringkas di
-- halaman utama. V18 menambahkan menu pantauan mandiri yang SINKRON dengan
-- penilaian guru:
--   1. santri_prestasi_card()    → Kartu Prestasi (rekap + rata-rata + presensi)
--   2. santri_pantauan_feed()    → Pantauan Pembelajaran (semua modul, kronologis)
--   3. santri_presensi_rekap()   → Rekap Presensi per bulan
--   4. santri_target_progress()  → Target halaqah + progres pencapaian
--   5. santri_raport_list()      → Daftar raport yang sudah FINAL
--
-- Semua fungsi SECURITY DEFINER dan HANYA mengembalikan data anak yang benar-
-- benar terhubung dengan akun ini (guardian_students) di tenant-nya sendiri.
-- Tidak ada tabel/kolom yang diubah (rule #38) dan tidak ada policy yang
-- dilonggarkan — akses baca raport tetap tertutup di RLS, dibuka terbatas
-- lewat RPC ini saja.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: validasi sesi wali/santri + kembalikan tenant.
-- ----------------------------------------------------------------------------
create or replace function public.santri_guard()
returns uuid
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

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'WALI_SANTRI' then
    raise exception 'AKSES_DITOLAK';
  end if;

  return v_tenant;
end;
$$;
grant execute on function public.santri_guard() to authenticated;

-- ============================================================================
-- 1. KARTU PRESTASI
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
    select s.id as student_id, s.full_name as student_name, s.business_code
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
    select a.student_id, x.modul, x.score_value, x.tgl
    from anak a
    join lateral (
      select 'TAHFIDZ'::text as modul, t.score_value, t.assessed_at::date as tgl
        from public.tahfidz_assessments t
        where t.student_id = a.student_id and t.tenant_id = v_tenant and t.status = 'DINILAI'
      union all
      select 'TARTIL', t.score_value, t.assessed_at::date
        from public.tartil_assessments t
        where t.student_id = a.student_id and t.tenant_id = v_tenant and t.deleted_at is null
      union all
      select l.module_type::text, l.score_value, l.assessed_date
        from public.learning_assessments l
        where l.student_id = a.student_id and l.tenant_id = v_tenant and l.deleted_at is null
      union all
      select 'TUGAS', sc.score_value, sc.assessed_at::date
        from public.tugas_halaqah_scores sc
        where sc.student_id = a.student_id and sc.tenant_id = v_tenant
      union all
      select 'TAJWID', sc.score_value, sc.assessed_at::date
        from public.tajwid_materi_scores sc
        where sc.student_id = a.student_id and sc.tenant_id = v_tenant
      union all
      select 'SETORAN', sb.score_value, sb.assessed_date
        from public.tahfidz_submissions sb
        where sb.student_id = a.student_id and sb.tenant_id = v_tenant and sb.deleted_at is null
    ) x on true
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
        'catatanApresiasi', ap.catatan
      ) order by a.student_name
    ), '[]'::jsonb)
  into v_out
  from anak a
  left join halaqah   hq on hq.student_id = a.student_id
  left join agg       ag on ag.student_id = a.student_id
  left join hafalan   hf on hf.student_id = a.student_id
  left join presensi  pr on pr.student_id = a.student_id
  left join apresiasi ap on ap.student_id = a.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_prestasi_card() to authenticated;

-- ============================================================================
-- 2. PANTAUAN PEMBELAJARAN — semua modul, kronologis
-- ============================================================================
create or replace function public.santri_pantauan_feed(
  p_student_id uuid default null,
  p_limit      integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
  v_limit  integer := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_out    jsonb;
begin
  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid
      and s.tenant_id = v_tenant
      and (p_student_id is null or s.id = p_student_id)
  ),
  feed as (
    -- Hafalan tahfidz (penilaian surat)
    select a.student_id, a.student_name, 'TAHFIDZ'::text as module,
           coalesce(ts.name_override, ms.name, 'Surat') as title,
           'Penilaian hafalan surat'::text as detail,
           t.status::text as status, t.score_label, t.score_value, t.note as free_note,
           tc.full_name as teacher_name, t.assessed_at::date as tgl
    from public.tahfidz_assessments t
    join anak a on a.student_id = t.student_id
    left join public.tahfidz_tenant_surahs ts on ts.id = t.tenant_surah_id
    left join public.tahfidz_surahs ms on ms.id = ts.surah_id
    left join public.teachers tc on tc.id = t.teacher_id
    where t.tenant_id = v_tenant

    union all
    -- Setoran hafalan / murojaah
    select a.student_id, a.student_name, 'SETORAN',
           coalesce(ts.name_override, ms.name, 'Surat'),
           concat_ws(' · ',
             case sb.kind when 'HAFALAN_BARU' then 'Hafalan Baru' else 'Murojaah' end,
             nullif(sb.ayat_label, '')),
           sb.result::text, sb.score_label, sb.score_value, sb.free_note,
           tc.full_name, sb.assessed_date
    from public.tahfidz_submissions sb
    join anak a on a.student_id = sb.student_id
    left join public.tahfidz_tenant_surahs ts on ts.id = sb.tenant_surah_id
    left join public.tahfidz_surahs ms on ms.id = ts.surah_id
    left join public.teachers tc on tc.id = sb.teacher_id
    where sb.tenant_id = v_tenant and sb.deleted_at is null

    union all
    -- Tartil (mengaji)
    select a.student_id, a.student_name, 'TARTIL',
           coalesce(m.name, 'Materi Tartil'),
           nullif(concat_ws(' ', 'Hal.', coalesce(tr.pages_label, m.pages_label)), 'Hal.'),
           tr.status::text, tr.score_label, tr.score_value, tr.free_note,
           tc.full_name, tr.assessed_at::date
    from public.tartil_assessments tr
    join anak a on a.student_id = tr.student_id
    left join public.tartil_materials m on m.id = tr.material_id
    left join public.teachers tc on tc.id = tr.teacher_id
    where tr.tenant_id = v_tenant and tr.deleted_at is null

    union all
    -- Hadits / Doa / Tajwid (modul pembelajaran)
    select a.student_id, a.student_name, l.module_type::text,
           coalesce(h.title, p.title, tj.title, 'Materi'),
           null::text,
           l.status::text, l.score_label, l.score_value, l.free_note,
           tc.full_name, l.assessed_date
    from public.learning_assessments l
    join anak a on a.student_id = l.student_id
    left join public.hadith_materials h on h.id = l.hadith_id
    left join public.daily_prayer_materials p on p.id = l.prayer_id
    left join public.tajwid_materials tj on tj.id = l.tajwid_id
    left join public.teachers tc on tc.id = l.teacher_id
    where l.tenant_id = v_tenant and l.deleted_at is null

    union all
    -- Tajwid (grid materi)
    select a.student_id, a.student_name, 'TAJWID',
           coalesce(tm.title, 'Materi Tajwid'), null::text,
           'DINILAI'::text, sc.score_label, sc.score_value, null::text,
           null::text, sc.assessed_at::date
    from public.tajwid_materi_scores sc
    join anak a on a.student_id = sc.student_id
    left join public.tajwid_materi tm on tm.id = sc.materi_id
    where sc.tenant_id = v_tenant

    union all
    -- Tugas halaqah
    select a.student_id, a.student_name, 'TUGAS',
           coalesce(tg.title, 'Tugas'),
           case when tg.due_date is not null
                then 'Batas: ' || to_char(tg.due_date, 'DD Mon YYYY') end,
           'DINILAI'::text, sc.score_label, sc.score_value, sc.note,
           tc.full_name, sc.assessed_at::date
    from public.tugas_halaqah_scores sc
    join anak a on a.student_id = sc.student_id
    left join public.tugas_halaqah tg on tg.id = sc.tugas_id
    left join public.teachers tc on tc.id = tg.teacher_id
    where sc.tenant_id = v_tenant and coalesce(tg.deleted_at, null) is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   student_id,
           'studentName', student_name,
           'module',      module,
           'title',       title,
           'detail',      detail,
           'status',      status,
           'scoreLabel',  score_label,
           'scoreValue',  score_value,
           'freeNote',    free_note,
           'teacherName', teacher_name,
           'assessedDate', tgl
         ) order by tgl desc nulls last), '[]'::jsonb)
  into v_out
  from (select * from feed order by tgl desc nulls last limit v_limit) x;

  return v_out;
end;
$$;
grant execute on function public.santri_pantauan_feed(uuid, integer) to authenticated;

-- ============================================================================
-- 3. REKAP PRESENSI
-- ============================================================================
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
           'recent', coalesce(tk.items, '[]'::jsonb)
         ) order by a.student_name), '[]'::jsonb)
  into v_out
  from anak a
  left join total t     on t.student_id = a.student_id
  left join terakhir tk on tk.student_id = a.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_presensi_rekap(integer) to authenticated;

-- ============================================================================
-- 4. TARGET HALAQAH + PROGRES ANAK
-- ============================================================================
create or replace function public.santri_target_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
  v_out    jsonb;
begin
  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
  ),
  anak_halaqah as (
    select distinct on (hs.student_id)
      hs.student_id, hs.halaqah_id, h.name as halaqah_name
    from public.halaqah_students hs
    join public.halaqahs h on h.id = hs.halaqah_id
    join anak a on a.student_id = hs.student_id
    where hs.left_at is null and h.tenant_id = v_tenant
    order by hs.student_id, hs.joined_at desc
  ),
  target as (
    select a.student_id, a.student_name, ah.halaqah_name,
           ht.id as target_id, ht.category, ht.target_value,
           ht.start_date, ht.end_date, ht.description,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
  ),
  progres as (
    select t.student_id, t.target_id,
           case t.category
             when 'TAHFIDZ' then (
               select count(*) from public.tahfidz_assessments x
               where x.student_id = t.student_id and x.tenant_id = v_tenant
                 and x.status = 'DINILAI'
                 and x.assessed_at::date between t.start_date and t.end_date
             )
             else (
               select count(*) from public.learning_assessments l
               where l.student_id = t.student_id and l.tenant_id = v_tenant
                 and l.deleted_at is null
                 and l.module_type::text = t.category
                 and l.status::text = 'LULUS'
                 and l.assessed_date between t.start_date and t.end_date
             )
           end as capaian
    from target t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   t.student_id,
           'studentName', t.student_name,
           'halaqahName', t.halaqah_name,
           'targetId',    t.target_id,
           'category',    t.category,
           'targetValue', t.target_value,
           'capaian',     coalesce(p.capaian, 0),
           'startDate',   t.start_date,
           'endDate',     t.end_date,
           'description', t.description,
           'teacherName', t.teacher_name
         ) order by t.student_name, t.end_date), '[]'::jsonb)
  into v_out
  from target t
  left join progres p on p.target_id = t.target_id and p.student_id = t.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_target_progress() to authenticated;

-- ============================================================================
-- 5. DAFTAR RAPORT FINAL
-- ============================================================================
create or replace function public.santri_raport_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.santri_guard();
  v_out    jsonb;
begin
  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'reportId',      r.id,
           'studentId',     r.student_id,
           'studentName',   a.student_name,
           'title',         r.title,
           'academicYear',  r.academic_year,
           'semesterLabel', r.semester_label,
           'periodLabel',   r.period_label,
           'periodStart',   r.period_start,
           'periodEnd',     r.period_end,
           'finalizedAt',   r.finalized_at,
           'teacherName',   tc.full_name
         ) order by r.finalized_at desc nulls last), '[]'::jsonb)
  into v_out
  from public.reports r
  join anak a on a.student_id = r.student_id
  left join public.teachers tc on tc.id = r.teacher_id
  where r.tenant_id = v_tenant and r.status = 'FINAL';

  return v_out;
end;
$$;
grant execute on function public.santri_raport_list() to authenticated;
