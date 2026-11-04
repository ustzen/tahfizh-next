-- ============================================================================
-- TAHFIZH V82 — Semua penilaian mode CENTANG: tercentang = 100, belum = 0
-- ============================================================================
-- Lanjutan V81 (yang baru mengubah hafalan/tahfidz). Aturan yang sama kini
-- berlaku untuk SEMUA modul bermode centang: Hadits, Doa, Tajwid, Tartil, Tugas
-- (dan Setoran bila dicentang).
--
--   • Tercentang (✓)                       → 100
--   • Belum / Belum Menguasai              → 0
--   • Item target yang belum dicentang     → 0 (ikut menurunkan rata-rata)
--   • Hadits & Doa dengan target guru      → total poin ÷ jumlah item target
--                                            (10 hadits dicentang ÷ target 10 = 100)
--   • Tanpa target                         → centang ÷ cakupan modul × 100
--                                            (hadits/doa: katalog aktif lembaga;
--                                             tartil/tajwid: materi aktif;
--                                             tugas: tugas halaqah)
--   • Campuran centang + angka/huruf       → rata-rata, baris "belum" ikut (0)
--
-- Tambahan: penilaian ganda pada materi yang sama dihitung sekali (terbaru).
-- Memperbarui fungsi internal student_module_scores; kartu prestasi, peringkat
-- santri, dan peringkat guru otomatis ikut karena memanggil fungsi yang sama.
-- Tidak ada data yang diubah. Idempotent.
-- ============================================================================

-- Target per santri untuk kategori TAHFIDZ / HADITS / DOA (internal).
create or replace function public.student_target_cat(p_tenant uuid, p_students uuid[], p_category text)
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
        and st.category = p_category
        and st.student_id = any(p_students)
      union all
      select hs.student_id, ht.item_ids, ht.target_value, 1
      from public.halaqah_students hs
      join public.halaqah_targets ht
        on ht.halaqah_id = hs.halaqah_id
       and ht.tenant_id = p_tenant
       and ht.category = p_category
      where hs.left_at is null
        and hs.student_id = any(p_students)
    ) u
    order by u.sid, u.prio
  ) x;
$$;

revoke all on function public.student_target_cat(uuid, uuid[], text) from public, anon, authenticated;

-- Pembungkus lama (dipakai kartu prestasi) kini memakai fungsi umum di atas.
create or replace function public.student_target_tahfidz(p_tenant uuid, p_students uuid[])
returns table (t_student uuid, t_items uuid[], t_n integer)
language sql
stable
security definer
set search_path = public
as $$
  select k.t_student, k.t_items, k.t_n
  from public.student_target_cat(p_tenant, p_students, 'TAHFIDZ') k;
$$;

revoke all on function public.student_target_tahfidz(uuid, uuid[]) from public, anon, authenticated;

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
    select 'TAHFIDZ'::text as cat, k.t_student, k.t_items, k.t_n
    from public.student_target_cat(p_tenant, p_students, 'TAHFIDZ') k
    union all
    select 'HADITS', k.t_student, k.t_items, k.t_n
    from public.student_target_cat(p_tenant, p_students, 'HADITS') k
    union all
    select 'DOA', k.t_student, k.t_items, k.t_n
    from public.student_target_cat(p_tenant, p_students, 'DOA') k
  ),
  rows_all as (
    -- Hafalan — bila ada daftar surat target, hanya surat target yang dihitung.
    select t.student_id as sid, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from public.tahfidz_assessments t
    left join tgt on tgt.t_student = t.student_id and tgt.cat = 'TAHFIDZ'
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
    select q.student_id, q.module_type::text, q.score_value, q.score_label, q.fb
    from (
      select distinct on (l.student_id, l.module_type, coalesce(l.hadith_id, l.prayer_id, l.tajwid_id))
             l.student_id, l.module_type, l.score_value, l.score_label,
             coalesce(l.hadith_id, l.prayer_id) as item_id,
             case l.status::text
               when 'BELUM_MENGUASAI' then 0     -- centang "belum" = 0
               when 'PERLU_MENGULANG' then 65
               when 'PERLU_LATIHAN'   then 65
               when 'BELUM_SELESAI'   then 50
               else 85 end as fb
      from public.learning_assessments l
      where l.tenant_id = p_tenant
        and l.student_id = any(p_students)
        and l.deleted_at is null
      order by l.student_id, l.module_type, coalesce(l.hadith_id, l.prayer_id, l.tajwid_id),
               l.assessed_date desc nulls last, l.created_at desc
    ) q
    left join tgt on tgt.t_student = q.student_id and tgt.cat = q.module_type::text
    where tgt.t_items is null or q.item_id = any(tgt.t_items)
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
           count(*) filter (where not x.ada and not x.is_chk and x.poin = 0) as n_zero,
           coalesce(sum(x.poin) filter (where x.ada), 0) as sum_exp,
           coalesce(sum(x.poin), 0) as sum_all,
           avg(x.poin) filter (where x.poin is not null) as avg_all
    from rows_res x
    group by x.sid, x.modul
  ),
  scope_tenant as (
    select 'TAHFIDZ'::text as modul,
           (select count(*) from public.tahfidz_tenant_surahs
             where tenant_id = p_tenant and is_active)::numeric as total
    union all
    select 'HADITS',
           (select count(*) from public.hadith_materials
             where tenant_id = p_tenant and is_active)::numeric
    union all
    select 'DOA',
           (select count(*) from public.daily_prayer_materials
             where tenant_id = p_tenant and is_active)::numeric
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
             -- Ada target (hafalan/hadits/doa): total poin ÷ jumlah item target.
             when coalesce(tg.t_n, 0) > 0
               then a.sum_all / tg.t_n
             when a.n_exp > 0
               then (a.sum_exp + 100.0 * a.n_chk) / (a.n_exp + a.n_chk + a.n_zero)
             when a.n_chk > 0 and coalesce(st.total, ts.total, 0) > 0
               then 100.0 * a.n_chk / coalesce(st.total, ts.total)
             else a.avg_all
           end)) as poin
  from agg a
  left join tgt tg on tg.t_student = a.sid and tg.cat = a.modul
  left join scope_tenant st on st.modul = a.modul
  left join tugas_scope ts on ts.sid = a.sid and a.modul = 'TUGAS'
  where case
          when coalesce(tg.t_n, 0) > 0 then true
          when a.n_exp > 0 then true
          when a.n_chk > 0 then true
          else a.avg_all is not null
        end;
end;
$$;


revoke all on function public.student_module_scores(uuid, uuid[]) from public, anon, authenticated;
