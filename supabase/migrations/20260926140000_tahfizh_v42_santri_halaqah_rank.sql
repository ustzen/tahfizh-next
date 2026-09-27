-- ============================================================================
-- TAHFIZH V42 — Peringkat sementara santri di halaqahnya
-- ============================================================================
-- Cincin di pojok kanan atas Kartu Prestasi diisi peringkat sementara:
-- rata-rata SEMUA penilaian berangka (tahfidz, tartil, hadits, doa, tajwid,
-- tugas, setoran) santri dibandingkan dengan seluruh santri aktif di
-- halaqah yang sama. Peringkat = dense_rank rata-rata tertinggi → terendah;
-- nilai sama mendapat peringkat sama. Santri belum bernilai tidak diperingkat.
--
-- SECURITY DEFINER karena perhitungan melibatkan nilai santri lain sekelas,
-- yang memang tidak bisa dibaca akun wali via RLS. Output dibatasi hanya
-- anak milik akun ini. Tidak ada tabel/policy yang diubah. Idempotent.
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
    select s.student_id, round(avg(x.score_value))::int as rata
    from sekelas s
    join lateral (
      select t.score_value
        from public.tahfidz_assessments t
        where t.student_id = s.student_id and t.tenant_id = v_tenant
          and t.status = 'DINILAI' and t.score_value is not null
      union all
      select t.score_value
        from public.tartil_assessments t
        where t.student_id = s.student_id and t.tenant_id = v_tenant
          and t.deleted_at is null and t.score_value is not null
      union all
      select l.score_value
        from public.learning_assessments l
        where l.student_id = s.student_id and l.tenant_id = v_tenant
          and l.deleted_at is null and l.score_value is not null
      union all
      select sc.score_value
        from public.tugas_halaqah_scores sc
        where sc.student_id = s.student_id and sc.tenant_id = v_tenant
          and sc.score_value is not null
      union all
      select sc.score_value
        from public.tajwid_materi_scores sc
        where sc.student_id = s.student_id and sc.tenant_id = v_tenant
          and sc.score_value is not null
      union all
      select sb.score_value
        from public.tahfidz_submissions sb
        where sb.student_id = s.student_id and sb.tenant_id = v_tenant
          and sb.deleted_at is null and sb.score_value is not null
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
