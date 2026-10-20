-- ============================================================================
-- TAHFIZH V71 — Perbaikan alur mengubah raport (guru & koordinator)
-- ============================================================================
-- Masalah: RPC report_template_detail (dibuat di V9) masih hanya mengizinkan
-- DEVELOPER (template global) dan ADMIN (salinan lembaga) membaca detail
-- template. Sejak V13, KOORDINATOR dan USTADZ sudah diizinkan menyalin dan
-- menyimpan layout template milik lembaganya, tetapi RPC detail tidak ikut
-- diperbarui — sehingga:
--   * Guru/koordinator menekan "Ubah" → getTemplateDetail() mengembalikan
--     null → halaman Report Builder jadi 404.
--   * Tombol "Pakai & Ubah" pada contoh bawaan gagal memuat builder.
--
-- Perbaikan:
--   1. report_template_detail — ADMIN, KOORDINATOR, dan USTADZ lembaga
--      boleh membaca detail salinan lembaganya; DEVELOPER tetap membaca
--      template global. Tetap tenant-scoped.
--   2. Migrasi ini juga menjamin lembaga yang sudah punya salinan template
--      tetapi belum punya raport utama (kasus data lama V13) langsung punya
--      raport utama, agar tombol "Buat Raport Santri" dan builder selalu
--      tersedia.
-- Idempoten & repair-safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. report_template_detail: buka akses untuk staf lembaga (V13 semantics)
-- ---------------------------------------------------------------------------
create or replace function public.report_template_detail(p_template_id uuid)
returns table (
  id          uuid,
  tenant_id   uuid,
  name        text,
  description text,
  paper       text,
  orientation text,
  version     integer,
  is_active   boolean,
  layout      jsonb
)
language sql
security definer set search_path = public
as $$
  select t.id, t.tenant_id, t.name, t.description, t.paper, t.orientation,
         t.version, t.is_active, t.layout
  from public.report_templates t
  where t.id = p_template_id
    and (
      -- Template global (contoh bawaan platform): milik DEVELOPER.
      (t.tenant_id is null
       and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER')
      or
      -- Salinan lembaga: admin, koordinator, dan guru lembaga tersebut
      -- (V13 — semuanya boleh membuka & menyunting layout di Report Builder).
      (t.tenant_id = public.current_tenant_id()
       and (select role from public.profiles where id = auth.uid())
             in ('ADMIN', 'KOORDINATOR', 'USTADZ'))
    );
$$;

revoke execute on function public.report_template_detail(uuid) from public;
grant execute on function public.report_template_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pastikan setiap lembaga dengan template aktif punya raport utama
--    (kasus data lama: salinan dibuat sebelum V13, is_primary belum diisi).
-- ---------------------------------------------------------------------------
update public.report_templates t set is_primary = true
where t.tenant_id is not null
  and t.is_active
  and not exists (
    select 1 from public.report_templates p
    where p.tenant_id = t.tenant_id and p.is_primary
  )
  and t.id = (
    select t2.id from public.report_templates t2
    where t2.tenant_id = t.tenant_id and t2.is_active
    order by t2.created_at, t2.id
    limit 1
  );
