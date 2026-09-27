-- ============================================================================
-- TAHFIZH V46 — Tie-break peringkat: skor sama → NIS termuda (terbesar) di atas
-- ============================================================================
-- Sebelumnya skor sama mendapat peringkat sama (dense_rank murni). Sekarang
-- urutan dalam peringkat dipecah berdasarkan NIS: NIS LEBIH BESAR mendapat
-- peringkat LEBIH ATAS (nis 050 di atas 020). Dengan penomoran NIS berurutan
-- per angkatan di lembaga, santri kelas 1 (NIS terbesar/termuda) tampil di
-- atas santri kelas 6 ketika skor sama.
--
-- Catatan teknis:
--   • dense_rank dengan NIS di ORDER BY → peringkat menjadi unik 1..N.
--   • NIS dinormalisasi ke angka (regexp digit) agar "050" > "020";
--     NIS non-angka/kosong dianggap 0 (paling bawah).
--   • Berlaku untuk santri_halaqah_rank (Kartu Prestasi) dan
--     teacher_students_rank (Data Santri guru) — pemointan tetap V44.
-- Idempotent: create or replace + grant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kartu Prestasi (wali santri)
-- ----------------------------------------------------------------------------
create or replace function public.santri_halaqah_rank()
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
    select s.id as student_id
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
  sekelas as (
    select hs.halaqah_id, hs.student_id
    from public.halaqah_students hs
    where hs.left_at is null
      and hs.halaqah_id in (select halaqah_id from anak_halaqah)
  ),
  rows_all as (
    select s.student_id, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from sekelas s
    join public.tahfidz_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.status = 'DINILAI'
    union all
    select s.student_id, 'TARTIL', t.score_value, t.score_label, null::int
    from sekelas s
    join public.tartil_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.deleted_at is null and t.status = 'DINILAI'
    union all
    select s.student_id, l.module_type::text, l.score_value, l.score_label,
           case l.status::text
             when 'PERLU_MENGULANG' then 65
             when 'PERLU_LATIHAN'   then 65
             when 'BELUM_SELESAI'   then 50
             when 'BELUM_MENGUASAI' then 50
             else 85 end
    from sekelas s
    join public.learning_assessments l
      on l.student_id = s.student_id and l.tenant_id = v_tenant
    where l.deleted_at is null
    union all
    select s.student_id, 'TUGAS', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tugas_halaqah_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'TAJWID', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tajwid_materi_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'SETORAN', sb.score_value, sb.score_label,
           case sb.result::text
             when 'PERLU_MENGULANG' then 65
             when 'DITUNDA'         then 50
             else 85 end
    from sekelas s
    join public.tahfidz_submissions sb
      on sb.student_id = s.student_id and sb.tenant_id = v_tenant
    where sb.deleted_at is null
  ),
  rows_res as (
    select r.student_id, r.modul,
           coalesce(r.sv, g.max_value, r.fb) as poin,
           (r.sv is not null or g.max_value is not null) as ada_nilai
    from rows_all r
    left join public.tahfidz_grade_settings g
      on g.tenant_id = v_tenant
     and lower(btrim(g.label)) = lower(btrim(r.lbl))
  ),
  agg_val as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_fb as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where not ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_cnt as (
    select student_id, modul, count(*)::numeric as jml
    from rows_res
    group by student_id, modul
  ),
  scope_tenant as (
    select 'TAHFIDZ'::text as modul,
           (select count(*) from public.tahfidz_tenant_surahs
             where tenant_id = v_tenant and is_active)::numeric as total
    union all
    select 'TARTIL',
           (select count(*) from public.tartil_materials
             where tenant_id = v_tenant and is_active)::numeric
    union all
    select 'TAJWID',
           (select count(*) from public.tajwid_materi
             where tenant_id = v_tenant and deleted_at is null)::numeric
  ),
  tugas_scope as (
    select sc.student_id, count(t.id)::numeric as total
    from (select distinct student_id, halaqah_id from sekelas) sc
    left join public.tugas_halaqah t
      on t.halaqah_id = sc.halaqah_id
     and t.tenant_id = v_tenant
     and t.deleted_at is null
    group by sc.student_id
  ),
  agg_ratio as (
    select c.student_id, c.modul,
           case when st.total > 0 then 100.0 * c.jml / st.total
                when ts.total > 0 then 100.0 * c.jml / ts.total
           end as poin
    from agg_cnt c
    left join scope_tenant st on st.modul = c.modul
    left join tugas_scope ts on ts.student_id = c.student_id
    where c.modul in ('TAHFIDZ', 'TARTIL', 'TAJWID', 'TUGAS')
  ),
  skor_modul as (
    select v.student_id, v.modul,
           round(coalesce(a.poin, f.poin, r.poin))::int as poin
    from (select distinct student_id, modul from rows_res) v
    left join agg_val   a on a.student_id = v.student_id and a.modul = v.modul
    left join agg_fb    f on f.student_id = v.student_id and f.modul = v.modul
    left join agg_ratio r on r.student_id = v.student_id and r.modul = v.modul
  ),
  skor as (
    select student_id, round(avg(poin))::int as rata
    from skor_modul
    where poin is not null
    group by student_id
  ),
  ranking as (
    select s.student_id, s.halaqah_id,
           k.rata,
           case when k.rata is null then null
                else dense_rank() over (
                  partition by s.halaqah_id
                  order by k.rata desc,
                           coalesce(nullif(regexp_replace(st.nis, '[^0-9]', '', 'g'), '')::numeric, 0) desc,
                           st.nis desc nulls last
                )
           end as rank,
           count(k.rata) over (partition by s.halaqah_id)::int as total_ranked
    from sekelas s
    join public.students st on st.id = s.student_id
    left join skor k on k.student_id = s.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   r.student_id,
           'halaqahName', ah.halaqah_name,
           'rank',        r.rank,
           'totalRanked', coalesce(r.total_ranked, 0),
           'avgScore',    r.rata
         ) order by r.rank nulls last), '[]'::jsonb)
  into v_out
  from ranking r
  join anak a on a.student_id = r.student_id
  left join anak_halaqah ah on ah.student_id = r.student_id and ah.halaqah_id = r.halaqah_id;

  return v_out;
end;
$$;
grant execute on function public.santri_halaqah_rank() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Data Santri guru
-- ----------------------------------------------------------------------------
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
  rows_all as (
    select s.student_id, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from sekelas s
    join public.tahfidz_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.status = 'DINILAI'
    union all
    select s.student_id, 'TARTIL', t.score_value, t.score_label, null::int
    from sekelas s
    join public.tartil_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.deleted_at is null and t.status = 'DINILAI'
    union all
    select s.student_id, l.module_type::text, l.score_value, l.score_label,
           case l.status::text
             when 'PERLU_MENGULANG' then 65
             when 'PERLU_LATIHAN'   then 65
             when 'BELUM_SELESAI'   then 50
             when 'BELUM_MENGUASAI' then 50
             else 85 end
    from sekelas s
    join public.learning_assessments l
      on l.student_id = s.student_id and l.tenant_id = v_tenant
    where l.deleted_at is null
    union all
    select s.student_id, 'TUGAS', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tugas_halaqah_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'TAJWID', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tajwid_materi_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'SETORAN', sb.score_value, sb.score_label,
           case sb.result::text
             when 'PERLU_MENGULANG' then 65
             when 'DITUNDA'         then 50
             else 85 end
    from sekelas s
    join public.tahfidz_submissions sb
      on sb.student_id = s.student_id and sb.tenant_id = v_tenant
    where sb.deleted_at is null
  ),
  rows_res as (
    select r.student_id, r.modul,
           coalesce(r.sv, g.max_value, r.fb) as poin,
           (r.sv is not null or g.max_value is not null) as ada_nilai
    from rows_all r
    left join public.tahfidz_grade_settings g
      on g.tenant_id = v_tenant
     and lower(btrim(g.label)) = lower(btrim(r.lbl))
  ),
  agg_val as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_fb as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where not ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_cnt as (
    select student_id, modul, count(*)::numeric as jml
    from rows_res
    group by student_id, modul
  ),
  scope_tenant as (
    select 'TAHFIDZ'::text as modul,
           (select count(*) from public.tahfidz_tenant_surahs
             where tenant_id = v_tenant and is_active)::numeric as total
    union all
    select 'TARTIL',
           (select count(*) from public.tartil_materials
             where tenant_id = v_tenant and is_active)::numeric
    union all
    select 'TAJWID',
           (select count(*) from public.tajwid_materi
             where tenant_id = v_tenant and deleted_at is null)::numeric
  ),
  tugas_scope as (
    select sc.student_id, count(t.id)::numeric as total
    from (select distinct student_id, halaqah_id from sekelas) sc
    left join public.tugas_halaqah t
      on t.halaqah_id = sc.halaqah_id
     and t.tenant_id = v_tenant
     and t.deleted_at is null
    group by sc.student_id
  ),
  agg_ratio as (
    select c.student_id, c.modul,
           case when st.total > 0 then 100.0 * c.jml / st.total
                when ts.total > 0 then 100.0 * c.jml / ts.total
           end as poin
    from agg_cnt c
    left join scope_tenant st on st.modul = c.modul
    left join tugas_scope ts on ts.student_id = c.student_id
    where c.modul in ('TAHFIDZ', 'TARTIL', 'TAJWID', 'TUGAS')
  ),
  skor_modul as (
    select v.student_id, v.modul,
           round(coalesce(a.poin, f.poin, r.poin))::int as poin
    from (select distinct student_id, modul from rows_res) v
    left join agg_val   a on a.student_id = v.student_id and a.modul = v.modul
    left join agg_fb    f on f.student_id = v.student_id and f.modul = v.modul
    left join agg_ratio r on r.student_id = v.student_id and r.modul = v.modul
  ),
  skor as (
    select student_id, round(avg(poin))::int as rata
    from skor_modul
    where poin is not null
    group by student_id
  ),
  ranking as (
    select s.student_id, s.halaqah_id,
           k.rata,
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
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   r.student_id,
           'halaqahId',   r.halaqah_id,
           'rank',        r.rank,
           'totalRanked', coalesce(r.total_ranked, 0),
           'avgScore',    r.rata
         )), '[]'::jsonb)
  into v_out
  from ranking r;

  return v_out;
end;
$$;
grant execute on function public.teacher_students_rank() to authenticated;
