-- ============================================================================
-- TAHFIZH V57 — Perbaikan RPC santri_target_progress (rusak sejak V54)
-- ============================================================================
-- Gejala: tile Tahfidz di dasbor santri & halaman Target menampilkan "belum
-- ada target" padahal target sudah diatur guru.
--
-- Penyebab: CTE `target` tidak menyeleksi ht.start_date/ht.end_date, sedangkan
-- CTE `progres` memakainya lewat target_scope_period — query gagal saat
-- runtime ("column t.start_date does not exist") dan pembungkus aplikasi
-- menelan error menjadi daftar kosong.
--
-- Perbaikan:
--   1. CTE target menyeleksi ht.start_date, ht.end_date.
--   2. target_item_names() mengembalikan NULL (bukan '{}') bila tidak ada item
--      katalog, sehingga target teks lama (V38) tetap menampilkan daftarnya.
--
-- Idempoten: drop + create ulang. Jalankan SETELAH V54 (urutan V53–V56 bebas).
-- ============================================================================

-- 1. target_item_names: NULL bila tak ada ID katalog --------------------------
drop function if exists public.target_item_names(text, uuid[]);

create or replace function public.target_item_names(p_category text, p_ids uuid[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_names text[] := '{}';
  v_name  text;
  i       integer;
begin
  -- V57 — NULL (bukan '{}') bila tidak ada ID katalog, agar pemanggil bisa
  -- fallback ke kolom items (target teks lama).
  if p_ids is null or array_length(p_ids, 1) is null then
    return null;
  end if;

  for i in 1..array_length(p_ids, 1) loop
    if p_category = 'TAHFIDZ' then
      select coalesce(ts.name_override, m.name) into v_name
      from public.tahfidz_tenant_surahs ts
      left join public.tahfidz_surahs m on m.id = ts.surah_id
      where ts.id = p_ids[i];
    elsif p_category = 'HADITS' then
      select hm.title into v_name from public.hadith_materials hm where hm.id = p_ids[i];
    elsif p_category = 'DOA' then
      select dp.title into v_name from public.daily_prayer_materials dp where dp.id = p_ids[i];
    end if;
    if v_name is not null then
      v_names := v_names || v_name;
    end if;
  end loop;

  return v_names;
end;
$$;

-- 2. santri_target_progress -----------------------------------------------------
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
           ht.scope, ht.items, ht.item_ids, ht.description,
           -- V57 — wajib ada: dipakai target_scope_period di CTE progres.
           ht.start_date, ht.end_date,
           tc.full_name as teacher_name
    from anak a
    join anak_halaqah ah on ah.student_id = a.student_id
    join public.halaqah_targets ht on ht.halaqah_id = ah.halaqah_id
    left join public.teachers tc on tc.id = ht.teacher_id
    where ht.tenant_id = v_tenant
  ),
  progres as (
    select
      t.student_id, t.target_id,
      case
        -- Mode katalog (V54): capaian = item target yang sudah DINILAI/LULUS
        -- di penilaian dengan ID materi yang sama → sinkron dengan menu
        -- Tahfidz/Hadits/Doa, apa pun tanggal penilaiannya.
        when t.category = 'TAHFIDZ' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.tahfidz_assessments x
          where x.student_id = t.student_id and x.tenant_id = v_tenant
            and x.status = 'DINILAI'
            and x.tenant_surah_id = any(t.item_ids)
        )
        when t.category = 'HADITS' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type = 'HADITS' and l.status = 'LULUS'
            and l.hadith_id = any(t.item_ids)
        )
        when t.category = 'DOA' and coalesce(array_length(t.item_ids, 1), 0) > 0 then (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type = 'DOA' and l.status = 'LULUS'
            and l.prayer_id = any(t.item_ids)
        )
        -- Mode teks (data lama V38) & target jumlah polos (V17): hitung
        -- penilaian dalam periode cakupan — perilaku lama dipertahankan.
        when t.category = 'TAHFIDZ' then (
          select count(*) from public.tahfidz_assessments x
          where x.student_id = t.student_id and x.tenant_id = v_tenant
            and x.status = 'DINILAI'
            and x.assessed_at::date between per.period_start and per.period_end
        )
        else (
          select count(*) from public.learning_assessments l
          where l.student_id = t.student_id and l.tenant_id = v_tenant
            and l.deleted_at is null
            and l.module_type::text = t.category
            and l.status::text = 'LULUS'
            and l.assessed_date between per.period_start and per.period_end
        )
      end as capaian
    from target t
    cross join lateral public.target_scope_period(v_tenant, t.scope, t.start_date, t.end_date) per
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
           'items',       coalesce(array_to_string(public.target_item_names(t.category, t.item_ids), E'\n'), t.items),
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
