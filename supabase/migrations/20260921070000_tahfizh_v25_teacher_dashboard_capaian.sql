-- ============================================================================
-- TAHFIZH V25 — Rata-Rata Capaian Halaqah pada dasbor guru
--
-- Menambahkan `avgAchievement` (0-100, atau null bila belum ada data) ke
-- v8_teacher_dashboard(): persentase rata-rata surah yang sudah berstatus
-- DINILAI dari total surah aktif tenant, dirata-ratakan di seluruh santri
-- aktif pada halaqah yang diampu guru. Metrik ini independen dari mode
-- penilaian (CENTANG/HURUF/ANGKA) karena hanya memakai kolom `status`
-- (rule #25), jadi tetap valid untuk semua tenant.
-- ============================================================================

create or replace function public.v8_teacher_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_teacher uuid := public.halaqah_current_teacher();
  v_tenant uuid := public.current_tenant_id();
  v_halaqah int;
  v_students int;
  v_present int;
  v_total_today int;
  v_active_surahs int;
  v_avg_achievement numeric;
begin
  if v_teacher is null or v_tenant is null then
    return jsonb_build_object(
      'halaqah', 0, 'students', 0, 'presentToday', 0, 'totalToday', 0, 'avgAchievement', null
    );
  end if;

  select count(distinct ht.halaqah_id) into v_halaqah
  from public.halaqah_teachers ht
  join public.halaqahs h on h.id = ht.halaqah_id
  where ht.teacher_id = v_teacher and h.tenant_id = v_tenant and h.status = 'ACTIVE';

  select count(distinct hs.student_id) into v_students
  from public.halaqah_students hs
  join public.halaqahs h on h.id = hs.halaqah_id
  join public.halaqah_teachers ht on ht.halaqah_id = h.id
  where ht.teacher_id = v_teacher and hs.left_at is null and h.tenant_id = v_tenant;

  select
    count(*) filter (where r.status = 'HADIR'),
    count(*)
  into v_present, v_total_today
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  join public.halaqah_teachers ht on ht.halaqah_id = s.halaqah_id
  where ht.teacher_id = v_teacher and s.session_date = current_date;

  -- Rata-rata capaian: % surah aktif tenant yang sudah DINILAI, per santri
  -- aktif di halaqah guru, lalu dirata-ratakan.
  select count(*) into v_active_surahs
  from public.tahfidz_tenant_surahs
  where tenant_id = v_tenant and is_active = true;

  if v_active_surahs > 0 then
    with active_students as (
      select distinct hs.student_id
      from public.halaqah_students hs
      join public.halaqahs h on h.id = hs.halaqah_id
      join public.halaqah_teachers ht on ht.halaqah_id = h.id
      where ht.teacher_id = v_teacher and hs.left_at is null and h.tenant_id = v_tenant
    ),
    per_student as (
      select
        a.student_id,
        count(ta.id) filter (where ta.status = 'DINILAI') as done
      from active_students a
      left join public.tahfidz_assessments ta
        on ta.student_id = a.student_id and ta.tenant_id = v_tenant
      group by a.student_id
    )
    select avg(done::numeric / v_active_surahs * 100)
    into v_avg_achievement
    from per_student;
  end if;

  return jsonb_build_object(
    'halaqah', v_halaqah, 'students', v_students,
    'presentToday', v_present, 'totalToday', v_total_today,
    'avgAchievement', case when v_avg_achievement is null then null else round(v_avg_achievement) end
  );
end;
$$;

grant execute on function public.v8_teacher_dashboard() to authenticated;
