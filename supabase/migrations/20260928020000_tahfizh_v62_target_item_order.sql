-- ============================================================================
-- TAHFIZH V62 — Urutkan nama item target sesuai urutan katalog (bukan acak)
-- ============================================================================
-- Masalah: target_item_names() mengembalikan nama mengikuti urutan `item_ids`
-- (urutan guru mencentang di picker), sehingga daftar surat/hadits/doa di
-- dasbor santri tampil acak.
--
-- Perbaikan: nama dikembalikan urut sesuai urutan katalog lembaga
-- (`sort_order`, lalu nama) — sama seperti picker target & grid Tahfidz.
-- Karena `items` dan `itemStatus` (V61) sama-sama memakai fungsi ini, urutan
-- keduanya konsisten dan centang sejajar dengan namanya.
--
-- Idempoten: drop + create ulang. Tidak mengubah data/penilaian.
-- ============================================================================

drop function if exists public.target_item_names(text, uuid[]);

create or replace function public.target_item_names(p_category text, p_ids uuid[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_ids is null or array_length(p_ids, 1) is null then null
    else coalesce(array_agg(k.name order by k.sort_order, k.name), '{}'::text[])
  end
  from (
    select coalesce(ts.name_override, m.name) as name, ts.sort_order
    from public.tahfidz_tenant_surahs ts
    left join public.tahfidz_surahs m on m.id = ts.surah_id
    where p_category = 'TAHFIDZ' and ts.id = any(p_ids)
    union all
    select hm.title as name, hm.sort_order
    from public.hadith_materials hm
    where p_category = 'HADITS' and hm.id = any(p_ids)
    union all
    select dp.title as name, dp.sort_order
    from public.daily_prayer_materials dp
    where p_category = 'DOA' and dp.id = any(p_ids)
  ) k;
$$;

grant execute on function public.target_item_names(text, uuid[]) to authenticated;
