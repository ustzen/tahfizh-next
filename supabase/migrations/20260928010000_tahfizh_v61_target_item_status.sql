-- ============================================================================
-- TAHFIZH V61 — Status per item target untuk dasbor santri (auto-centang)
-- ============================================================================
-- Kebutuhan: halaman Target santri menampilkan daftar surat/hadits/doa dengan
-- centang otomatis — item yang sudah dicapai santri (hafal/ LULUS) langsung
-- tercentang, sinkron dengan target yang ditetapkan guru.
--
-- Sebelumnya santri_target_progress() hanya mengembalikan `capaian` (jumlah),
-- bukan item mana yang sudah tercapai. Migrasi ini menambahkan field
-- `itemStatus` = array [{ name, done }] selaras dengan daftar `items`.
--
-- Aturan pencocokan (SAMA seperti capaian di V57, jadi jumlah centang = capaian):
--   * TAHFIDZ : penilaian tahfidz_assessments status DINILAI pada surah itu.
--   * HADITS  : learning_assessments module HADITS status LULUS pada materi itu.
--   * DOA     : learning_assessments module DOA status LULUS pada doa itu.
--
-- Idempoten: drop + create ulang. Tabel penilaian tidak diubah.
-- ============================================================================

-- 1. target_item_status(): daftar { name, done } untuk satu target --------------
drop function if exists public.target_item_status(text, uuid[], text, uuid, uuid);

create or replace function public.target_item_status(
  p_category   text,
  p_ids        uuid[],
  p_items      text,
  p_student_id uuid,
  p_tenant     uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_names  text[];
  v_name   text;
  v_done   boolean;
  v_len    integer;
  i        integer;
begin
  if p_student_id is null or p_tenant is null then
    return '[]'::jsonb;
  end if;

  -- Daftar nama item: mode katalog (ids, urut) atau mode teks lama (items).
  if p_ids is not null and array_length(p_ids, 1) is not null then
    v_names := public.target_item_names(p_category, p_ids);
    if v_names is null then
      v_names := '{}';
    end if;
  else
    v_names := array(
      select btrim(x)
      from unnest(string_to_array(coalesce(p_items, ''), E'\n')) x
      where btrim(x) <> ''
    );
  end if;

  v_len := coalesce(array_length(v_names, 1), 0);
  for i in 1..v_len loop
    v_name := v_names[i];

    if p_category = 'TAHFIDZ' then
      select exists(
        select 1
        from public.tahfidz_assessments x
        left join public.tahfidz_tenant_surahs ts on ts.id = x.tenant_surah_id
        left join public.tahfidz_surahs ms on ms.id = ts.surah_id
        where x.student_id = p_student_id and x.tenant_id = p_tenant
          and x.status = 'DINILAI'
          and coalesce(ts.name_override, ms.name) = v_name
      ) into v_done;
    elsif p_category = 'HADITS' then
      select exists(
        select 1
        from public.learning_assessments l
        join public.hadith_materials hm on hm.id = l.hadith_id
        where l.student_id = p_student_id and l.tenant_id = p_tenant
          and l.deleted_at is null
          and l.module_type = 'HADITS' and l.status = 'LULUS'
          and hm.title = v_name
      ) into v_done;
    elsif p_category = 'DOA' then
      select exists(
        select 1
        from public.learning_assessments l
        join public.daily_prayer_materials dp on dp.id = l.prayer_id
        where l.student_id = p_student_id and l.tenant_id = p_tenant
          and l.deleted_at is null
          and l.module_type = 'DOA' and l.status = 'LULUS'
          and dp.title = v_name
      ) into v_done;
    else
      v_done := false;
    end if;

    v_result := v_result || jsonb_build_object('name', v_name, 'done', coalesce(v_done, false));
  end loop;

  return v_result;
end;
$$;

grant execute on function public.target_item_status(text, uuid[], text, uuid, uuid) to authenticated;

-- 2. santri_target_progress(): tambah field itemStatus ------------------------
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
           -- V61 — status centang per item (selaras dengan urutan `items`).
           'itemStatus',  public.target_item_status(
                            t.category, t.item_ids, t.items, t.student_id, v_tenant
                          ),
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
