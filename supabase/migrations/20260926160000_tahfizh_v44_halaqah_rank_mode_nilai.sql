-- ============================================================================
-- TAHFIZH V44 — Peringkat halaqah sesuai mode nilai: CENTANG / HURUF / ANGKA
-- ============================================================================
-- Aturan pemointan per modul (permintaan pemilik):
--   • ANGKA : pakai angka aslinya (score_value).
--   • HURUF : nilai TERTINGGI dari rentang grade lembaga — label "A+" yang
--             terdefinisi 95–100 dihitung 100 (tahfidz_grade_settings.max_value).
--   • CENTANG: proporsi yang sudah dicentang dari cakupan modul —
--             hafalan 8/10 surat → 80; tugas 20/20 → 100.
-- Prioritas per modul: rata-rata nilai eksplisit (angka/huruf) → fallback
-- status (learning/setoran: lulus 85, perlu mengulang 65, belum 50) →
-- rasio centang. Centang terdeteksi karena label "✓" tidak termasuk grade.
--
-- Cakupan rasio: TAHFIDZ = surah aktif, TARTIL = materi aktif,
-- TAJWID = tajwid_materi aktif, TUGAS = tugas halaqah aktif anak.
-- Idempotent: create or replace + grant; aman setelah V42/V43.
-- ============================================================================

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
    -- Hafalan (mode per lembaga: tahfidz_settings)
    select s.student_id, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from sekelas s
    join public.tahfidz_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.status = 'DINILAI'
    union all
    -- Tartil (mode per lembaga: tartil_settings)
    select s.student_id, 'TARTIL', t.score_value, t.score_label, null::int
    from sekelas s
    join public.tartil_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.deleted_at is null and t.status = 'DINILAI'
    union all
    -- Hadits & Doa (learning, berbasis status)
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
    -- Tugas halaqah (mode per baris)
    select s.student_id, 'TUGAS', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tugas_halaqah_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    -- Tajwid materi grid (mode per baris)
    select s.student_id, 'TAJWID', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tajwid_materi_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    -- Setoran (berbasis hasil)
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
    -- Nilai eksplisit: angka asli atau puncak rentang huruf
    select student_id, modul, avg(poin) as poin
    from rows_res
    where ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_fb as (
    -- Fallback status/hasil (learning & setoran tanpa angka/huruf)
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
    -- Rasio centang: dicentang / cakupan modul × 100
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
                else dense_rank() over (partition by s.halaqah_id order by k.rata desc)
           end as rank,
           count(k.rata) over (partition by s.halaqah_id)::int as total_ranked
    from sekelas s
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
