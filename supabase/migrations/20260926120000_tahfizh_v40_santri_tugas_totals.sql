-- ============================================================================
-- TAHFIZH V40 — Penyebut persentase Kartu Prestasi (tugas + materi modul)
-- ============================================================================
-- Kebutuhan meter persentase di Kartu Prestasi:
--   • Pengerjaan Tugas : tugas dikerjakan / tugas DIBERIKAN (5/10 → 50%).
--   • Hadits/Doa/Tajwid: materi lulus / target guru, atau tanpa target guru →
--     / jumlah materi AKTIF modul itu di lembaga (penyebut fallback).
--
-- Satu RPC SECURITY DEFINER mengembalikan keempat penyebut per anak milik
-- akun wali ini. RPC santri_prestasi_card (V18) tidak diubah — penggabungan
-- terjadi di server component. Tidak ada tabel/policy yang disentuh.
-- Idempotent: create or replace + grant, aman dijalankan ulang.
-- ============================================================================

create or replace function public.santri_meter_totals()
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
    select distinct hs.student_id, hs.halaqah_id
    from public.halaqah_students hs
    join anak a on a.student_id = hs.student_id
    where hs.left_at is null
  ),
  tugas_total as (
    select a.student_id, count(t.id)::int as tugas_total
    from anak a
    left join anak_halaqah ah on ah.student_id = a.student_id
    left join public.tugas_halaqah t
      on t.halaqah_id = ah.halaqah_id
     and t.tenant_id = v_tenant
     and t.deleted_at is null
    group by a.student_id
  ),
  materi as (
    select
      (select count(*) from public.hadith_materials
        where tenant_id = v_tenant and is_active)::int        as hadits_total,
      (select count(*) from public.daily_prayer_materials
        where tenant_id = v_tenant and is_active)::int        as doa_total,
      (select count(*) from public.tajwid_materials
        where tenant_id = v_tenant and is_active)::int        as tajwid_total
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   st.student_id,
           'tugasTotal',  st.tugas_total,
           'haditsTotal', m.hadits_total,
           'doaTotal',    m.doa_total,
           'tajwidTotal', m.tajwid_total
         )), '[]'::jsonb)
  into v_out
  from tugas_total st cross join materi m;

  return v_out;
end;
$$;

grant execute on function public.santri_meter_totals() to authenticated;

-- Versi awal V40 (hanya tugas) — digantikan fungsi di atas.
drop function if exists public.santri_tugas_totals();
