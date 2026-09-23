-- ============================================================================
-- TAHFIZH V12 — REPAIR: policy RLS `students_select` kembali tenant-wide
-- ============================================================================
-- Gejala: santri yang BELUM punya halaqah tidak muncul di menu Data Santri
-- (dan pilihan anggota halaqah). Kode aplikasi (manager.tsx, getStudentOptions,
-- mutasi, global search) selalu memakai query tenant-wide tanpa filter
-- halaqah — sehingga satu-satunya mekanisme yang bisa menyaring baris santri
-- adalah policy SELECT pada public.students. Database live terindikasi masih
-- menyimpan policy `students_select` versi iterasi lama yang membatasi baris
-- pada anggota halaqah (exists halaqah_students), sehingga santri baru yang
-- belum ditempatkan di halaqah tersembunyi.
--
-- Repair idempoten: drop + recreate dengan bentuk tenant-wide sejak V1.
-- Tetap tenant-isolated penuh (TANPA USING(true)) — aturan multi-tenant #3.
-- ============================================================================

drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );
