-- ============================================================================
-- TAHFIZH — PATCH: Perbaikan Backfill Default (Tartil / Setoran / Learning)
-- ============================================================================
-- KAPAN DIPAKAI:
--   Bila menjalankan supabase/tahfizh-combined.sql di database yang sudah
--   punya lembaga muncul error 42883 seperti:
--     "function public.tartil_seed_materials(tenants) does not exist"
--     "function public.learning_seed_note_templates(tenants) does not exist"
--     (atau error serupa di sekitar learning_backfill_defaults)
--   berarti database memuat definisi fungsi backfill LAMA yang memanggil
--   fungsi TRIGGER dengan argumen baris tenants. Patch ini menggantinya
--   dengan versi benar.
--
-- CARA PAKAI:
--   Supabase Dashboard → SQL Editor → paste seluruh file ini → Run.
--   Cukup SEKALI. Idempoten: aman dijalankan berulang (data yang sudah ada
--   di-skip, tidak pernah diduplikasi).
--
-- PERSYARATAN:
--   Jalankan SETELAH tabel dibuat (setelah tahfizh-combined.sql atau
--   migrasi V1–V12). Tidak mengubah data lembaga yang sudah ada — hanya
--   mengisi default yang belum ada (WHERE NOT EXISTS).
--
-- TIDAK menyentuh RLS, tidak ada USING(true), multi-tenant tetap terisolasi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. V4 — Backfill materi + template catatan Tartil (insert langsung)
-- ---------------------------------------------------------------------------
create or replace function public.tartil_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tartil_materials (tenant_id, name, jilid, sort_order)
  select p_tenant, v.name, v.jilid, v.sort_order
  from (values
    ('Iqra Jilid 1', '1', 1),
    ('Iqra Jilid 2', '2', 2),
    ('Iqra Jilid 3', '3', 3),
    ('Iqra Jilid 4', '4', 4),
    ('Iqra Jilid 5', '5', 5),
    ('Iqra Jilid 6', '6', 6),
    ('Al-Qur''an',   null, 7)
  ) as v(name, jilid, sort_order)
  where not exists (select 1 from public.tartil_materials m where m.tenant_id = p_tenant);

  insert into public.tartil_note_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.tartil_note_slot, v.content, v.sort_order
  from (values
    ('APRESIASI', 'Alhamdulillah, bacaan ananda sudah semakin baik.', 1),
    ('BACAAN', 'Perhatikan panjang pendek bacaan (mad & harakat).', 2),
    ('FASHOHAH', 'Perhatikan makhraj huruf.', 3),
    ('SARAN', 'Latihan membaca secara rutin.', 4),
    ('CATATAN_ORANG_TUA', 'Mohon pendampingan membaca di rumah.', 5)
  ) as v(slot, content, sort_order)
  where not exists (select 1 from public.tartil_note_templates t where t.tenant_id = p_tenant);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. V5 — Backfill template catatan Setoran (insert langsung)
-- ---------------------------------------------------------------------------
create or replace function public.tahfidz_backfill_submission_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.submission_note_slot, v.content, v.sort_order
  from (values
    ('APRESIASI',          'Alhamdulillah, hafalan ananda sudah semakin lancar.', 1),
    ('KELANCARAN',         'Sudah cukup lancar.',                                  2),
    ('KESALAHAN',          'Masih terdapat beberapa kesalahan pada akhir ayat.',   3),
    ('SARAN',              'Perbanyak murojaah sebelum setoran berikutnya.',       4),
    ('CATATAN_ORANG_TUA',  'Mohon mendampingi murojaah di rumah.',                 5)
  ) as v(slot, content, sort_order)
  where not exists (select 1 from public.tahfidz_submission_templates t where t.tenant_id = p_tenant);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. V6 — Backfill template catatan Learning/Hadits/Doa/Tajwid (insert langsung)
-- ---------------------------------------------------------------------------
create or replace function public.learning_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order)
  select p_tenant, v.module_type::public.learning_module, v.slot, v.content, v.sort_order
  from (values
    ('HADITS', 'APRESIASI', 'Alhamdulillah, hafalan hadits ananda semakin baik.', 1),
    ('HADITS', 'HAFALAN', 'Sudah menghafal lafaz hadits dengan lancar.', 2),
    ('HADITS', 'BACAAN', 'Bacaan hadits perlu diperbaiki pada lafaz tertentu.', 3),
    ('HADITS', 'SARAN', 'Perbanyak murojaah lafaz hadits.', 4),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon didampingi mengulang hafalan hadits di rumah.', 5),
    ('DOA', 'APRESIASI', 'Alhamdulillah, ananda semakin rajin mengamalkan doa.', 1),
    ('DOA', 'HAFALAN', 'Hafalan doa sudah lancar.', 2),
    ('DOA', 'PELAFALAN', 'Pelafalan bacaan doa perlu diperbaiki.', 3),
    ('DOA', 'PENGAMALAN', 'Terbiasa mengamalkan doa dalam keseharian.', 4),
    ('DOA', 'CATATAN_ORANG_TUA', 'Mohon mengingatkan ananda mengamalkan doa di rumah.', 5),
    ('TAJWID', 'PEMAHAMAN', 'Sudah memahami kaidah tajwid ini.', 1),
    ('TAJWID', 'PENERAPAN', 'Perlu latihan penerapan saat membaca Al-Qur''an.', 2),
    ('TAJWID', 'KESALAHAN', 'Masih terdapat kesalahan pada penerapan kaidah.', 3),
    ('TAJWID', 'SARAN', 'Perbanyak latihan membaca dengan memperhatikan kaidah.', 4),
    ('TAJWID', 'CATATAN_ORANG_TUA', 'Mohon mendampingi latihan membaca Al-Qur''an di rumah.', 5)
  ) as v(module_type, slot, content, sort_order)
  where not exists (select 1 from public.learning_note_templates t where t.tenant_id = p_tenant);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Jalankan backfill untuk SEMUA tenant dengan guard per-tenant:
--    satu tenant yang bermasalah TIDAK menggagalkan seluruh patch —
--    cukup warning, tenant lain tetap terisi.
-- ---------------------------------------------------------------------------
-- Tiap modul diperiksa dulu: jika tabelnya belum ada (database setengah-
-- migrasi karena file lama gagal di tengah), bagian itu di-skip dengan notice
-- — jalankan tahfizh-combined.sql versi baru untuk melengkapi skema.
do $$
declare
  v_tenant record;
  v_tartil_ok   boolean := to_regclass('public.tartil_materials') is not null
                      and to_regclass('public.tartil_note_templates') is not null
                      and to_regprocedure('public.tartil_backfill_defaults(uuid)') is not null;
  v_setoran_ok  boolean := to_regclass('public.tahfidz_submission_templates') is not null
                      and to_regprocedure('public.tahfidz_backfill_submission_defaults(uuid)') is not null;
  v_learning_ok boolean := to_regclass('public.learning_note_templates') is not null
                      and to_regprocedure('public.learning_backfill_defaults(uuid)') is not null;
begin
  if not to_regprocedure('public.tartil_backfill_defaults(uuid)') is not null then
    raise notice 'SKIP tartil: fungsi backfill belum ada.';
  elsif not to_regclass('public.tartil_materials') is not null then
    raise notice 'SKIP tartil: tabel belum ada (lengkapi skema dulu dengan tahfizh-combined.sql).';
  end if;
  if not to_regprocedure('public.tahfidz_backfill_submission_defaults(uuid)') is not null then
    raise notice 'SKIP setoran: fungsi backfill belum ada.';
  elsif not to_regclass('public.tahfidz_submission_templates') is not null then
    raise notice 'SKIP setoran: tabel belum ada (lengkapi skema dulu dengan tahfizh-combined.sql).';
  end if;
  if not to_regprocedure('public.learning_backfill_defaults(uuid)') is not null then
    raise notice 'SKIP learning: fungsi backfill belum ada.';
  elsif not to_regclass('public.learning_note_templates') is not null then
    raise notice 'SKIP learning: tabel belum ada (lengkapi skema dulu dengan tahfizh-combined.sql).';
  end if;

  for v_tenant in select id from public.tenants loop
    if v_tartil_ok then
      begin
        perform public.tartil_backfill_defaults(v_tenant.id);
      exception when others then
        raise warning 'tartil_backfill_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
      end;
    end if;
    if v_setoran_ok then
      begin
        perform public.tahfidz_backfill_submission_defaults(v_tenant.id);
      exception when others then
        raise warning 'tahfidz_backfill_submission_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
      end;
    end if;
    if v_learning_ok then
      begin
        perform public.learning_backfill_defaults(v_tenant.id);
      exception when others then
        raise warning 'learning_backfill_defaults gagal untuk tenant %: %', v_tenant.id, sqlerrm;
      end;
    end if;
  end loop;
end
$$;

do $$ begin
  raise notice 'PATCH SELESAI: fungsi backfill diperbaiki & default terisi (idempoten — aman dijalankan ulang).';
end $$;
