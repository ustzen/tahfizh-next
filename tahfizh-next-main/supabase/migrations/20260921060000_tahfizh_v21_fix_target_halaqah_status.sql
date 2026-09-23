-- ============================================================================
-- TAHFIZH V21.1 — PERBAIKAN: menu Target guru kosong padahal sudah mengampu
-- ============================================================================
-- Bug: target_halaqah_overview() (V17) memfilter `h.status = 'ACTIVE'` saat
-- mengambil daftar halaqah yang diampu guru. Halaman lain yang menampilkan
-- "halaqah yang diampu" (mis. halaqah_teacher_list — menu "Halaqah Saya")
-- TIDAK memfilter status ini, jadi begitu admin menonaktifkan sebuah halaqah
-- (tombol "Nonaktifkan" di manajer halaqah admin) guru yang masih tercatat
-- sebagai pengampu (baris di halaqah_teachers tidak dihapus saat nonaktif)
-- tetap melihat halaqah itu di "Halaqah Saya", tapi menu Target menampilkan
-- "Belum ada halaqah yang Anda ampu" — tidak konsisten dan membingungkan guru
-- yang yakin sudah mengampu.
--
-- Perbaikan: samakan perilaku dengan halaqah_teacher_list — tampilkan semua
-- halaqah yang diampu guru (aktif maupun nonaktif) di overview Target. Guru
-- tetap bisa membuat/mengubah target untuk halaqah tersebut (target_halaqah_save
-- tidak pernah memfilter status halaqah, hanya keanggotaan pengampu), jadi
-- menghapus filter ini juga menghilangkan ketidakcocokan submit vs tampilan.
-- Idempoten: create or replace, aman dijalankan ulang.
-- ============================================================================

create or replace function public.target_halaqah_overview()
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
  v_halaqah jsonb;
  v_targets jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    return jsonb_build_object('halaqah', '[]'::jsonb, 'targets', '[]'::jsonb);
  end if;

  -- V21.1: halaqah yang diampu guru (aktif maupun nonaktif — sama seperti
  -- halaqah_teacher_list / menu "Halaqah Saya") + jumlah santri aktif yang
  -- masih tergabung.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'name', h.name,
             'studentCount', (
               select count(*) from public.halaqah_students hs
               join public.students s on s.id = hs.student_id
               where hs.halaqah_id = h.id and hs.left_at is null and s.status = 'ACTIVE'
             )
           ) order by h.name), '[]'::jsonb)
  into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id and ht.teacher_id = v_teacher
  where h.tenant_id = v_tenant;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', t.id,
             'halaqahId', t.halaqah_id,
             'category', t.category,
             'targetValue', t.target_value,
             'startDate', t.start_date,
             'endDate', t.end_date,
             'description', t.description,
             'updatedAt', t.updated_at
           ) order by t.category), '[]'::jsonb)
  into v_targets
  from public.halaqah_targets t
  where t.tenant_id = v_tenant
    and t.halaqah_id in (
      select ht.halaqah_id from public.halaqah_teachers ht where ht.teacher_id = v_teacher
    );

  return jsonb_build_object('halaqah', v_halaqah, 'targets', v_targets);
end;
$$;

grant execute on function public.target_halaqah_overview() to authenticated;
