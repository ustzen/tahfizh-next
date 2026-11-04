-- ============================================================================
-- TAHFIZH V81 — Nilai centang = 100 / belum = 0, dan target sinkron dengan rata-rata
-- ============================================================================
-- Laporan: target 10 surat, santri sudah hafal semua, tetapi nilai rata-rata
-- hanya 76 (seharusnya 100).
--
-- Penyebab:
--   1. Penilaian CENTANG disimpan dengan label "✓" dan score_value KOSONG, jadi
--      rata-rata (kartu prestasi) mengabaikannya dan hanya menghitung angka
--      dari modul lain.
--   2. Rata-rata tidak mengenal TARGET: penyebut hafalan diambil dari seluruh
--      katalog surat, atau dari target halaqah saja (target per santri, V70,
--      tidak terbaca), bukan dari target yang dibuat guru.
--
-- Aturan baru (satu sumber kebenaran: student_module_scores):
--   • Centang tercentang = 100, belum menguasai = 0.
--   • Hafalan dengan target: (jumlah poin surat target) ÷ (jumlah surat target).
--     10 surat × 100 ÷ 10 surat = 100.  8 dari 10 surat = 80.
--   • Target per santri menimpa target halaqah; target berupa angka saja
--     (tanpa pilih surat) ikut terbaca.
--   • Rata-rata keseluruhan = rata-rata nilai modul — sama persis dengan yang
--     dipakai peringkat, sehingga kartu santri, peringkat santri, dan peringkat
--     guru selalu menampilkan angka yang sinkron.
--
-- Fungsi yang diperbarui: santri_prestasi_card, santri_halaqah_rank,
-- teacher_students_rank (tetap menghormati kriteria pilihan guru, V78).
-- Fungsi baru (internal, tidak bisa dipanggil klien): student_target_tahfidz,
-- student_module_scores. Tidak ada data yang diubah.
-- Idempotent: drop/create or replace.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Target TAHFIDZ per santri (internal): target per santri menimpa halaqah.
--    t_items = daftar surat target (null bila target hanya berupa angka),
--    t_n     = jumlah surat target.
-- ----------------------------------------------------------------------------
create or replace function public.student_target_tahfidz(p_tenant uuid, p_students uuid[])
returns table (t_student uuid, t_items uuid[], t_n integer)
language sql
stable
security definer
set search_path = public
as $$
  select x.sid,
         case when cardinality(x.items) > 0 then x.items end,
         coalesce(nullif(cardinality(x.items), 0), x.tv)::int
  from (
    select distinct on (u.sid) u.sid, u.items, u.tv
    from (
      select st.student_id as sid, st.item_ids as items, st.target_value as tv, 0 as prio
      from public.student_targets st
      where st.tenant_id = p_tenant
        and st.category = 'TAHFIDZ'
        and st.student_id = any(p_students)
      union all
      select hs.student_id, ht.item_ids, ht.target_value, 1
      from public.halaqah_students hs
      join public.halaqah_targets ht
        on ht.halaqah_id = hs.halaqah_id
       and ht.tenant_id = p_tenant
       and ht.category = 'TAHFIDZ'
      where hs.left_at is null
        and hs.student_id = any(p_students)
    ) u
    order by u.sid, u.prio
  ) x;
$$;

-- Fungsi internal: hanya dipanggil fungsi SECURITY DEFINER lain (bukan oleh klien).
revoke all on function public.student_target_tahfidz(uuid, uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Nilai per modul per santri — SATU sumber untuk kartu prestasi, peringkat
--    santri, dan peringkat guru.
--
--    Poin satu penilaian:
--      • angka                  → angka itu sendiri
--      • huruf                  → nilai tertinggi rentang huruf lembaga
--      • CENTANG (✓)            → 100
--      • belum menguasai        → 0   (status BELUM_MENGUASAI)
--      • lainnya (status/hasil) → pemetaan lama (lulus 85, perlu mengulang 65 ...)
--
--    Nilai modul:
--      • TAHFIDZ dengan target  → jumlah poin surat target ÷ jumlah surat target
--                                 (10 surat × 100 ÷ 10 surat = 100; belum dihafal = 0)
--      • ada angka/huruf        → rata-rata poin (centang ikut dihitung 100)
--      • hanya centang + ada cakupan (tartil/tajwid/tugas/tahfidz tanpa target)
--                               → centang ÷ cakupan modul × 100
--      • selain itu             → rata-rata poin
-- ----------------------------------------------------------------------------
create or replace function public.student_module_scores(p_tenant uuid, p_students uuid[])
returns table (r_student uuid, r_modul text, r_poin numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with tgt as (
    select * from public.student_target_tahfidz(p_tenant, p_students)
  ),
  rows_all as (
    -- Hafalan — bila ada daftar surat target, hanya surat target yang dihitung.
    select t.student_id as sid, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from public.tahfidz_assessments t
    left join tgt on tgt.t_student = t.student_id
    where t.tenant_id = p_tenant
      and t.student_id = any(p_students)
      and t.status::text = 'DINILAI'
      and (tgt.t_items is null or t.tenant_surah_id = any(tgt.t_items))
    union all
    select t.student_id, 'TARTIL', t.score_value, t.score_label, null::int
    from public.tartil_assessments t
    where t.tenant_id = p_tenant
      and t.student_id = any(p_students)
      and t.deleted_at is null
      and t.status::text = 'DINILAI'
    union all
    select l.student_id, l.module_type::text, l.score_value, l.score_label,
           case l.status::text
             when 'BELUM_MENGUASAI' then 0     -- centang "belum" = 0
             when 'PERLU_MENGULANG' then 65
             when 'PERLU_LATIHAN'   then 65
             when 'BELUM_SELESAI'   then 50
             else 85 end
    from public.learning_assessments l
    where l.tenant_id = p_tenant
      and l.student_id = any(p_students)
      and l.deleted_at is null
    union all
    select sc.student_id, 'TUGAS', sc.score_value, sc.score_label, null::int
    from public.tugas_halaqah_scores sc
    where sc.tenant_id = p_tenant and sc.student_id = any(p_students)
    union all
    select sc.student_id, 'TAJWID', sc.score_value, sc.score_label, null::int
    from public.tajwid_materi_scores sc
    where sc.tenant_id = p_tenant and sc.student_id = any(p_students)
    union all
    select sb.student_id, 'SETORAN', sb.score_value, sb.score_label,
           case sb.result::text
             when 'PERLU_MENGULANG' then 65
             when 'DITUNDA'         then 50
             else 85 end
    from public.tahfidz_submissions sb
    where sb.tenant_id = p_tenant
      and sb.student_id = any(p_students)
      and sb.deleted_at is null
  ),
  rows_res as (
    select r.sid, r.modul,
           (r.sv is not null or g.max_value is not null) as ada,
           (r.sv is null and g.max_value is null and r.lbl = '✓') as is_chk,
           case when r.sv is not null then r.sv::numeric
                when g.max_value is not null then g.max_value::numeric
                when r.lbl = '✓' then 100::numeric
                else r.fb::numeric end as poin
    from rows_all r
    left join public.tahfidz_grade_settings g
      on g.tenant_id = p_tenant
     and lower(btrim(g.label)) = lower(btrim(r.lbl))
  ),
  agg as (
    select x.sid, x.modul,
           count(*) filter (where x.ada)    as n_exp,
           count(*) filter (where x.is_chk) as n_chk,
           coalesce(sum(x.poin) filter (where x.ada), 0) as sum_exp,
           avg(x.poin) filter (where x.poin is not null) as avg_all
    from rows_res x
    group by x.sid, x.modul
  ),
  scope_tenant as (
    select 'TAHFIDZ'::text as modul,
           (select count(*) from public.tahfidz_tenant_surahs
             where tenant_id = p_tenant and is_active)::numeric as total
    union all
    select 'TARTIL',
           (select count(*) from public.tartil_materials
             where tenant_id = p_tenant and is_active)::numeric
    union all
    select 'TAJWID',
           (select count(*) from public.tajwid_materi
             where tenant_id = p_tenant and deleted_at is null)::numeric
  ),
  tugas_scope as (
    select hs.student_id as sid, count(distinct t.id)::numeric as total
    from public.halaqah_students hs
    join public.tugas_halaqah t
      on t.halaqah_id = hs.halaqah_id
     and t.tenant_id = p_tenant
     and t.deleted_at is null
    where hs.left_at is null and hs.student_id = any(p_students)
    group by hs.student_id
  )
  select a.sid, a.modul,
         least(100::numeric, greatest(0::numeric,
           case
             when a.modul = 'TAHFIDZ' and coalesce(tg.t_n, 0) > 0
               then (a.sum_exp + 100.0 * a.n_chk) / tg.t_n
             when a.n_exp > 0
               then (a.sum_exp + 100.0 * a.n_chk) / (a.n_exp + a.n_chk)
             when a.n_chk > 0 and coalesce(st.total, ts.total, 0) > 0
               then 100.0 * a.n_chk / coalesce(st.total, ts.total)
             else a.avg_all
           end)) as poin
  from agg a
  left join tgt tg on tg.t_student = a.sid and a.modul = 'TAHFIDZ'
  left join scope_tenant st on st.modul = a.modul
  left join tugas_scope ts on ts.sid = a.sid and a.modul = 'TUGAS'
  where case
          when a.modul = 'TAHFIDZ' and coalesce(tg.t_n, 0) > 0 then true
          when a.n_exp > 0 then true
          when a.n_chk > 0 then true
          else a.avg_all is not null
        end;
end;
$$;

revoke all on function public.student_module_scores(uuid, uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Kartu prestasi santri (rata-rata & nilai per modul)
-- ----------------------------------------------------------------------------
drop function if exists public.santri_prestasi_card();

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
  -- Fallback lama: semua surah aktif katalog lembaga (dipakai bila guru
  -- belum menetapkan target TAHFIDZ katalog).
  select count(*) into v_total_surah
  from public.tahfidz_tenant_surahs
  where tenant_id = v_tenant and is_active;

  with anak as (
    select s.id as student_id, s.full_name as student_name, s.business_code,
           s.nis, s.nisn,
           -- Foto: dari profil akun terkait (wali/santri). Untuk wali dengan
           -- >1 anak, hanya anak pertama (urut nama) yang memakai foto akun.
           (select p.avatar_url
              from public.guardians g
              join public.guardian_students gs2 on gs2.guardian_id = g.id
              join public.profiles p on p.id = g.profile_id
             where gs2.student_id = s.id
               and (select count(*) from public.guardian_students gs3
                    where gs3.guardian_id = g.id) = 1
             limit 1) as avatar_path
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant
    group by s.id
  ),
  halaqah as (
    select distinct on (hs.student_id)
      hs.student_id, hs.halaqah_id, h.name as halaqah_name
    from public.halaqah_students hs
    join public.halaqahs h on h.id = hs.halaqah_id
    join anak a on a.student_id = hs.student_id
    where hs.left_at is null
    order by hs.student_id, hs.joined_at desc
  ),
  -- V56 — target katalog guru: jumlah item TAHFIDZ yang dipilih = penyebut
  -- "target surat" santri (menggantikan jumlah seluruh katalog).
  -- V81 — target TAHFIDZ per santri (target per santri menimpa target halaqah),
  -- jumlah item katalog; bila target hanya berupa angka → target_value.
  target_total as (
    select tt.t_student as student_id, tt.t_n as n_items
    from public.student_target_tahfidz(v_tenant, (select array_agg(a2.student_id) from anak a2)) tt
  ),
  -- V81 — SATU sumber nilai (centang=100, belum=0, tahfidz = total ÷ target).
  msc as (
    select m.r_student, m.r_modul, m.r_poin
    from public.student_module_scores(v_tenant, (select array_agg(a3.student_id) from anak a3)) m
  ),
  skor_total as (
    select m.r_student as student_id, round(avg(m.r_poin))::int as avg_score
    from msc m
    group by m.r_student
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
    select pm.student_id,
           jsonb_object_agg(pm.modul, jsonb_build_object(
             'count', pm.jml,
             'avgScore', coalesce(round(ms.r_poin)::int, pm.avg_score),
             'lastDate', pm.last_tgl, 'lastTitle', pm.last_title
           )) as obj
    from per_modul pm
    left join msc ms on ms.r_student = pm.student_id and ms.r_modul = pm.modul
    group by pm.student_id
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
        'avatarPath',     a.avatar_path,
        'halaqahName',    hq.halaqah_name,
        'surahSelesai',   coalesce(hf.surah_selesai, 0),
        -- V56 — penyebut target = item target guru (katalog); fallback lama.
        'surahTotal',     case when coalesce(tt.n_items, 0) > 0
                               then tt.n_items else coalesce(v_total_surah, 0) end,
        -- Penanda sumber penyebut: true = target guru, false = fallback katalog.
        'surahTotalIsTarget', coalesce(tt.n_items, 0) > 0,
        -- V56b — jumlah seluruh surah aktif katalog (utk stat “total surat”
        -- yang dipisah dari target di dasbor santri).
        'surahTotalKatalog', coalesce(v_total_surah, 0),
        'avgScore',       coalesce(sk.avg_score, ag.avg_score),
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
  left join halaqah      hq on hq.student_id = a.student_id
  left join target_total tt on tt.student_id = a.student_id
  left join agg          ag on ag.student_id = a.student_id
  left join skor_total   sk on sk.student_id = a.student_id
  left join hafalan      hf on hf.student_id = a.student_id
  left join presensi     pr on pr.student_id = a.student_id
  left join per_modul_json pm on pm.student_id = a.student_id
  left join apresiasi    ap on ap.student_id = a.student_id;

  return v_out;
end;
$$;
grant execute on function public.santri_prestasi_card() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Peringkat santri di halaqahnya
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
  -- V81 — nilai per modul dari fungsi bersama (centang=100, belum=0, tahfidz ÷ target).
  skor_modul as (
    select m.r_student as student_id, m.r_modul as modul, round(m.r_poin)::int as poin
    from public.student_module_scores(v_tenant, (select coalesce(array_agg(distinct s2.student_id), '{}') from sekelas s2)) m
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
-- 5. Peringkat guru (Data Santri) — tetap memakai kriteria pilihan guru (V78)
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
    select m.r_student as student_id, m.r_modul as modul, round(m.r_poin)::int as poin
    from public.student_module_scores(v_tenant, (select coalesce(array_agg(distinct s2.student_id), '{}') from sekelas s2)) m
  ),
  abs_skor as (
    -- V78 — Absensi: persentase HADIR dari seluruh catatan presensi santri.
    select s.student_id, 'ABSENSI'::text as modul,
           round(100.0 * count(*) filter (where r.status::text = 'HADIR')
                 / nullif(count(*), 0))::int as poin
    from (select distinct student_id, halaqah_id from sekelas) s
    join public.attendance_records r
      on r.student_id = s.student_id
     and r.halaqah_id = s.halaqah_id
     and r.tenant_id = v_tenant
    group by s.student_id
  ),
  skor_modul_all as (
    select student_id, modul, poin from skor_modul
    union all
    select student_id, modul, poin from abs_skor
  ),
  skor as (
    select student_id, round(avg(poin))::int as rata
    from skor_modul_all
    where poin is not null and modul = any(v_modules)
    group by student_id
  ),
  ranking as (
    select s.student_id, s.halaqah_id,
           k.rata,
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
           'avgScore',    r.rata,
           'moduls',      coalesce(r.moduls, '{}'::jsonb)
         )), '[]'::jsonb)
  into v_out
  from ranking r;

  return v_out;
end;
$$;
grant execute on function public.teacher_students_rank() to authenticated;
