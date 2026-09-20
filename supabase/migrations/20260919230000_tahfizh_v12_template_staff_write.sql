-- ============================================================================
-- TAHFIZH V12.12 — RLS Template Catatan: guru & koordinator boleh menulis
-- ============================================================================
-- Fitur "template cepat" di form Setoran memungkinkan GURU menambah/mengubah
-- template catatan (pilih label Apresiasi/Kelancaran/dll.) langsung dari form
-- — tanpa harus lewat Pengaturan. Policy lama hanya mengizinkan ADMIN, jadi
-- usaha tambah template dari guru ditolak RLS ( gagal diam-diam di UI).
--
-- Perbaikan: policy write diperluas ke USTADZ + KOORDINATOR + ADMIN lembaga
-- (tetap tenant-scoped penuh — tidak ada USING(true)). Perubahan template
-- tetap tercatat pada tabel yang sama & sinkron dengan Pengaturan.
-- Idempoten: drop policy sebelum create.
-- ============================================================================

drop policy if exists tahfidz_submission_templates_admin_write on public.tahfidz_submission_templates;
drop policy if exists tahfidz_submission_templates_staff_write on public.tahfidz_submission_templates;
create policy tahfidz_submission_templates_staff_write on public.tahfidz_submission_templates
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR', 'USTADZ')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR', 'USTADZ')
  );

drop policy if exists learning_templates_admin_write on public.learning_note_templates;
drop policy if exists learning_templates_staff_write on public.learning_note_templates;
create policy learning_templates_staff_write on public.learning_note_templates
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR', 'USTADZ')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR', 'USTADZ')
  );
