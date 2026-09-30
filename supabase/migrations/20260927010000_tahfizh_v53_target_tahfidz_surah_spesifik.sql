-- ============================================================================
-- TAHFIZH V53 — Capaian target TAHFIDZ = surat yang ditargetkan
-- ============================================================================
-- Masalah: santri_target_progress menghitung capaian TAHFIDZ dari JUMLAH
-- penilaian dalam periode cakupan, tanpa melihat surat mana yang dijadikan
-- target. Guru menarget surat tertentu di tengah urutan; santri yang hafal
-- surat lain sampai jumlahnya cukup dianggap sudah mencapai target.
--
-- Perbaikan: bila target TAHFIDZ punya `items` (daftar yang diketik guru,
-- V38), capaian = banyaknya baris target yang suratnya sudah berstatus
-- DINILAI untuk santri bersangkutan — terlepas dari kapan dinilai (yang
-- dihitung adalah penguasaan surat itu, bukan tanggal penilaiannya).
--
-- Pencocokan nama (helper `tahfizh_norm_surah`, dipakai di kedua sisi):
--   • huruf besar-kecil, spasi, apostrof ('/’), dan strip diabaikan
--   • awalan alias dibuang: "Surat Al-Ma'un", "Surah …", "S. …", "Al-…"
--   • baris "X…" (diakhiri elipsis) = dari surat X sampai akhir urutan
--   • cocok dengan nama asli maupun nama kustom lembaga (name_override)
--   • nama yang tidak dikenal diabaikan (tidak menghentikan perhitungan)
--
-- Target TANPA items (data lama V17, jumlah polos) & HADITS/DOA tetap
-- memakai hitungan penilaian dalam periode. Idempoten: drop + create ulang.
-- ============================================================================

-- 1. Normalisasi label surah untuk pencocokan --------------------------------
drop function if exists public.tahfizh_norm_surah(text);

create or replace function public.tahfizh_norm_surah(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_name, '')), E' \u2019\'-', ''),
               '^(surat|surah)', ''),
             '^s[.]', ''),
           '^al-', '')
$$;

-- 2. santri_target_progress ---------------------------------------------------
drop function if exists public.santri_target_progress();

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
           ht.scope, ht.items, ht.description,
           per.period_start, per.period_end,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    cross join lateral public.target_scope_period(v_tenant, ht.scope, ht.start_date, ht.end_date) per
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
  ),
  progres as (
    select t.student_id, t.target_id,
           case t.category
             when 'TAHFIDZ' then (
               case
                 -- Data lama (tanpa daftar): jumlah penilaian dalam periode.
                 when coalesce(t.items, '') = '' then (
                   select count(*) from public.tahfidz_assessments x
                   where x.student_id = t.student_id and x.tenant_id = v_tenant
                     and x.status = 'DINILAI'
                     and x.assessed_at::date between t.period_start and t.period_end
                 )
                 -- V53: daftar surah — hitung baris target yang suratnya
                 -- sudah DINILAI (penguasaan, bukan tanggal penilaian).
                 else (
                   select count(*) from (
                     select distinct btrim(ln) as line
                     from regexp_split_to_table(t.items, E'\n') as ln
                   ) ls
                   where case
                     when ls.line like '%…' then exists (
                       -- Rentang "X…": dari surah X sampai akhir urutan tenant.
                       -- Bila X tidak dikenal, baris ini diabaikan (bukan
                       -- menghitung semua surah).
                       select 1
                       from public.tahfidz_tenant_surahs ts0
                       left join public.tahfidz_surahs m0 on m0.id = ts0.surah_id
                       where ts0.tenant_id = v_tenant
                         and public.tahfizh_norm_surah(coalesce(ts0.name_override, m0.name)) =
                             public.tahfizh_norm_surah(rtrim(ls.line, '… '))
                         and exists (
                           select 1
                           from public.tahfidz_assessments x
                           join public.tahfidz_tenant_surahs ts on ts.id = x.tenant_surah_id
                           where x.student_id = t.student_id and x.tenant_id = v_tenant
                             and x.status = 'DINILAI'
                             and ts.sort_order >= ts0.sort_order
                         )
                     )
                     else exists (
                       select 1
                       from public.tahfidz_assessments x
                       join public.tahfidz_tenant_surahs ts on ts.id = x.tenant_surah_id
                       left join public.tahfidz_surahs m on m.id = ts.surah_id
                       where x.student_id = t.student_id and x.tenant_id = v_tenant
                         and x.status = 'DINILAI'
                         and public.tahfizh_norm_surah(coalesce(ts.name_override, m.name)) =
                             public.tahfizh_norm_surah(ls.line)
                     )
                   end
                 )
               end
             )
             else (
               select count(*) from public.learning_assessments l
               where l.student_id = t.student_id and l.tenant_id = v_tenant
                 and l.deleted_at is null
                 and l.module_type::text = t.category
                 and l.status::text = 'LULUS'
                 and l.assessed_date between t.period_start and t.period_end
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
           'scope',       t.scope,
           'items',       t.items,
           'description', t.description,
           'teacherName', t.teacher_name
         ) order by t.student_name, t.category), '[]'::jsonb)
  into v_out
  from target t
  left join progres p on p.target_id = t.target_id and p.student_id = t.student_id;

  return v_out;
end;
$$;

grant execute on function public.santri_target_progress() to authenticated;
