-- ============================================================================
-- TAHFIZH V43 — Peringkat halaqah: poin default untuk penilaian non-angka
-- ============================================================================
-- Perbaikan V42: grid penilaian umumnya memakai mode CENTANG/HURUF sehingga
-- score_value kosong — peringkat tidak pernah terhitung (cincin selalu "–").
-- Sekarang SETIAP penilaian yang sudah dinilai dipetakan ke poin:
--   • score_value terisi                    → pakai angka aslinya (1–100).
--   • Dinilai / lulus / centang (tanpa angka) → 85.
--   • Perlu mengulang / perlu latihan        → 65.
--   • Belum selesai / belum menguasai / ditunda → 50.
-- Pemetaan sama untuk semua santri, jadi perbandingan tetap adil.
-- Idempotent: create or replace + grant; aman dijalankan setelah V42.
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
  skor as (
    select s.student_id, round(avg(x.poin))::int as rata
    from sekelas s
    join lateral (
      -- Hafalan (tahfidz): DINILAI tanpa angka = lulus setoran → 85
      select coalesce(t.score_value, 85) as poin
        from public.tahfidz_assessments t
        where t.student_id = s.student_id and t.tenant_id = v_tenant
          and t.status = 'DINILAI'
      union all
      -- Tartil
      select coalesce(t.score_value, 85)
        from public.tartil_assessments t
        where t.student_id = s.student_id and t.tenant_id = v_tenant
          and t.deleted_at is null
      union all
      -- Hadits / Doa / Tajwid (learning): status menentukan poin default
      select coalesce(l.score_value, case l.status::text
               when 'PERLU_MENGULANG'  then 65
               when 'PERLU_LATIHAN'    then 65
               when 'BELUM_SELESAI'    then 50
               when 'BELUM_MENGUASAI'  then 50
               else 85 end)
        from public.learning_assessments l
        where l.student_id = s.student_id and l.tenant_id = v_tenant
          and l.deleted_at is null
      union all
      -- Tugas halaqah: centang/huruf tanpa angka → 85
      select coalesce(sc.score_value, 85)
        from public.tugas_halaqah_scores sc
        where sc.student_id = s.student_id and sc.tenant_id = v_tenant
      union all
      -- Tajwid (materi grid)
      select coalesce(sc.score_value, 85)
        from public.tajwid_materi_scores sc
        where sc.student_id = s.student_id and sc.tenant_id = v_tenant
      union all
      -- Setoran: hasil menentukan poin default
      select coalesce(sb.score_value, case sb.result::text
               when 'PERLU_MENGULANG' then 65
               when 'DITUNDA'         then 50
               else 85 end)
        from public.tahfidz_submissions sb
        where sb.student_id = s.student_id and sb.tenant_id = v_tenant
          and sb.deleted_at is null
    ) x on true
    group by s.student_id
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
