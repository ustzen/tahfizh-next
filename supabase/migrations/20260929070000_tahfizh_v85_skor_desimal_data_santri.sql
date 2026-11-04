-- ============================================================================
-- TAHFIZH V85 — Skor di Data Santri guru tampil dengan angka desimal
-- ============================================================================
-- Sebelumnya `avgScore` dari teacher_students_rank dibulatkan ke bilangan
-- bulat (mis. 85). Kini dikirim 1 angka di belakang koma (mis. 85.4) dihitung
-- dari nilai modul yang TIDAK dibulatkan.
--
-- PERINGKAT TIDAK BERUBAH: urutan/rank tetap memakai skor bulat `rata` persis
-- seperti V81 (sama dengan Kartu Prestasi santri), hanya angka yang tampil
-- yang lebih teliti. Skor per modul di tooltip tetap bulat.
-- Idempoten: create or replace.
-- ============================================================================

create or replace function public.teacher_students_rank()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_out     jsonb;
  v_modules text[];
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.current_teacher_id();

  -- V78 — modul yang dipakai guru ini untuk peringkat (default: semua modul
  -- nilai kecuali absensi, sama persis dengan perilaku V46).
  select r.modules into v_modules
  from public.teacher_rank_settings r
  where r.profile_id = v_uid;
  if v_modules is null or cardinality(v_modules) = 0 then
    v_modules := array['TAHFIDZ','TARTIL','HADITS','DOA','TAJWID','TUGAS','SETORAN'];
  end if;

  with halaqah_ampu as (
    select distinct ht.halaqah_id
    from public.halaqah_teachers ht
    where v_role = 'USTADZ' and v_teacher is not null and ht.teacher_id = v_teacher
    union all
    select h.id
    from public.halaqahs h
    where v_role in ('KOORDINATOR', 'ADMIN') and h.tenant_id = v_tenant
  ),
  sekelas as (
    select hs.halaqah_id, hs.student_id
    from public.halaqah_students hs
    where hs.left_at is null
      and hs.halaqah_id in (select halaqah_id from halaqah_ampu)
  ),
  -- V81 — nilai per modul dari fungsi bersama (centang=100, belum=0, tahfidz ÷ target).
  skor_modul as (
    select m.r_student as student_id, m.r_modul as modul, round(m.r_poin)::int as poin,
           m.r_poin as poin_dec
    from public.student_module_scores(v_tenant, (select coalesce(array_agg(distinct s2.student_id), '{}') from sekelas s2)) m
  ),
  abs_skor as (
    -- V78 — Absensi: persentase HADIR dari seluruh catatan presensi santri.
    select s.student_id, 'ABSENSI'::text as modul,
           round(100.0 * count(*) filter (where r.status::text = 'HADIR')
                 / nullif(count(*), 0))::int as poin,
           100.0 * count(*) filter (where r.status::text = 'HADIR')
                 / nullif(count(*), 0) as poin_dec
    from (select distinct student_id, halaqah_id from sekelas) s
    join public.attendance_records r
      on r.student_id = s.student_id
     and r.halaqah_id = s.halaqah_id
     and r.tenant_id = v_tenant
    group by s.student_id
  ),
  skor_modul_all as (
    select student_id, modul, poin, poin_dec from skor_modul
    union all
    select student_id, modul, poin, poin_dec from abs_skor
  ),
  skor as (
    select student_id, round(avg(poin))::int as rata,
           round(avg(poin_dec), 1) as rata_dec
    from skor_modul_all
    where poin is not null and modul = any(v_modules)
    group by student_id
  ),
  ranking as (
    select s.student_id, s.halaqah_id,
           k.rata,
           k.rata_dec,
           mm.j as moduls,
           case when k.rata is null then null
                else dense_rank() over (
                  partition by s.halaqah_id
                  order by k.rata desc,
                           coalesce(nullif(regexp_replace(st.nis, '[^0-9]', '', 'g'), '')::numeric, 0) desc,
                           st.nis desc nulls last
                )
           end as rank,
           count(k.rata) over (partition by s.halaqah_id)::int as total_ranked
    from (select distinct student_id, halaqah_id from sekelas) s
    join public.students st on st.id = s.student_id
    left join skor k on k.student_id = s.student_id
    left join lateral (
      select jsonb_object_agg(m.modul, m.poin) as j
      from skor_modul_all m
      where m.student_id = s.student_id
        and m.poin is not null
        and m.modul = any(v_modules)
    ) mm on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   r.student_id,
           'halaqahId',   r.halaqah_id,
           'rank',        r.rank,
           'totalRanked', coalesce(r.total_ranked, 0),
           'avgScore',    coalesce(r.rata_dec, r.rata),
           'moduls',      coalesce(r.moduls, '{}'::jsonb)
         )), '[]'::jsonb)
  into v_out
  from ranking r;

  return v_out;
end;
$$;
grant execute on function public.teacher_students_rank() to authenticated;
