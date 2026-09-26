-- ============================================================================
-- TAHFIZH V40 — Total tugas halaqah per anak (untuk persentase Kartu Prestasi)
-- ============================================================================
-- Kebutuhan: di Kartu Prestasi, meter "Pengerjaan Tugas" butuh penyebut —
-- berapa tugas yang DIBERIKAN ke halaqah anak — bukan hanya berapa yang sudah
-- dinilai (tugas_halaqah_scores). Contoh: 10 tugas diberikan, santri
-- mengerjakan 5 → 50%.
--
-- Solusi: RPC kecil SECURITY DEFINER yang mengembalikan total tugas aktif
-- (deleted_at is null) di halaqah yang sedang ditempati tiap anak milik akun
-- wali ini. RPC santri_prestasi_card (V18) tidak diubah — jumlah digabung di
-- server component. Tidak ada tabel/policy yang disentuh.
-- Idempotent: create or replace + grant, aman dijalankan ulang.
-- ============================================================================

create or replace function public.santri_tugas_totals()
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
  total as (
    select ah.student_id, count(t.id)::int as tugas_total
    from anak_halaqah ah
    left join public.tugas_halaqah t
      on t.halaqah_id = ah.halaqah_id
     and t.tenant_id = v_tenant
     and t.deleted_at is null
    group by ah.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',  st.student_id,
           'tugasTotal', st.tugas_total
         )), '[]'::jsonb)
  into v_out
  from total st;

  return v_out;
end;
$$;

grant execute on function public.santri_tugas_totals() to authenticated;
