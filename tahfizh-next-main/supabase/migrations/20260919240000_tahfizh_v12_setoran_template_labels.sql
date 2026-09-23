-- ============================================================================
-- TAHFIZH V12.12 — Template Cepat Setoran: label & contoh sesuai contoh baru
-- ============================================================================
-- Grup template cepat di form Setoran disederhanakan menjadi 5 label:
--   APRESIASI · BACAAN · TAJWID & FASHAHAH · SEMANGAT · SARAN UNTUK ORANG TUA
-- dengan contoh per label mengikuti contoh terbaru (2-3 contoh per label,
-- tanpa titik akhiran sehingga klik beberapa template tidak menghasilkan
-- tanda baca ganda). Placeholder {nama} diganti nama depan santri oleh form.
--
-- 1. Nilai enum `submission_note_slot` baru: BACAAN, TAJWID_FASHAHAH, SEMANGAT.
-- 2. Hapus DEFAULT lama V5/V6 — HANYA baris berisi persis teks seed lama;
--    template buatan/editan lembaga tidak pernah tersentuh.
-- 3. Seed contoh baru per lembaga untuk modul TAHFIDZ, HADITS, dan DOA.
-- 4. Fungsi trigger seed lembaga baru (tahfidz + learning) diganti agar
--    lembaga yang baru mendaftar juga langsung dapat set baru ini.
--
-- CATATAN IDEMPOTEN (penting): Postgres melarang MEMAKAI nilai enum yang baru
-- ditambahkan dalam transaksi yang sama ("unsafe use of new value"). File
-- gabungan dijalankan sebagai satu batch, jadi seed tahfidz yang memakai nilai
-- enum baru dibungkus penanganan exception: pada run pertama muncul NOTICE
-- "jalankan ulang sekali lagi", dan pada run berikutnya terisi penuh. Rerun
-- selanjutnya no-op (WHERE NOT EXISTS) — tidak pernah menduplikasi data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nilai enum baru (idempoten)
-- ---------------------------------------------------------------------------
alter type public.submission_note_slot add value if not exists 'BACAAN' after 'APRESIASI';
alter type public.submission_note_slot add value if not exists 'TAJWID_FASHAHAH' after 'KESALAHAN';
alter type public.submission_note_slot add value if not exists 'SEMANGAT' after 'SARAN';

-- ---------------------------------------------------------------------------
-- 2. Set contoh baru (tanpa titik akhiran) — dipakai ulang untuk 3 modul
-- ---------------------------------------------------------------------------
-- APRESIASI (2) · BACAAN (3) · TAJWID & FASHAHAH (3) · SEMANGAT (2) ·
-- SARAN UNTUK ORANG TUA (3, slot CATATAN_ORANG_TUA)

create or replace function public.setoran_seed_template_labels(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- (a) Hapus default lama V5/V6 — hanya teks seed lama yang persis sama.
  delete from public.tahfidz_submission_templates t
  where t.tenant_id = p_tenant
    and t.content in (
      'Alhamdulillah, hafalan ananda sudah semakin lancar.',
      'Sudah cukup lancar.',
      'Masih terdapat beberapa kesalahan pada akhir ayat.',
      'Perbanyak murojaah sebelum setoran berikutnya.',
      'Mohon mendampingi murojaah di rumah.'
    );

  delete from public.learning_note_templates t
  where t.tenant_id = p_tenant
    and t.module_type in ('HADITS', 'DOA')
    and t.content in (
      'Alhamdulillah, hafalan hadits ananda semakin baik.',
      'Sudah menghafal lafaz hadits dengan lancar.',
      'Bacaan hadits perlu diperbaiki pada lafaz tertentu.',
      'Perbanyak murojaah lafaz hadits.',
      'Mohon didampingi mengulang hafalan hadits di rumah.',
      'Alhamdulillah, ananda semakin rajin mengamalkan doa.',
      'Hafalan doa sudah lancar.',
      'Pelafalan bacaan doa perlu diperbaiki.',
      'Terbiasa mengamalkan doa dalam keseharian.',
      'Mohon mengingatkan ananda mengamalkan doa di rumah.'
    );

  -- (b) TAHFIDZ — slot enum. Nilai enum baru belum dipakai bila alter type
  --     baru saja dijalankan dalam transaksi yang sama → catch & notice.
  begin
    insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order)
    select p_tenant, v.slot::public.submission_note_slot, v.content, v.sort_order
    from (values
      ('APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
      ('APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
      ('BACAAN',            'Bacaan sudah lancar', 3),
      ('BACAAN',            'Bacaan cukup lancar', 4),
      ('BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
      ('TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
      ('TAJWID_FASHAHAH',   'Fashahah bagus', 7),
      ('TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
      ('SEMANGAT',          'Semangat belajar sangat baik', 9),
      ('SEMANGAT',          'Perlu motivasi lebih', 10),
      ('CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
      ('CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
      ('CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13)
    ) as v(slot, content, sort_order)
    where not exists (
      select 1 from public.tahfidz_submission_templates t
      where t.tenant_id = p_tenant and t.slot::text = v.slot and t.content = v.content
    );
  exception
    when others then
      if sqlerrm like 'unsafe use of new value%' then
        raise notice 'SEED template tahfidz ditunda (nilai enum baru) — jalankan ulang file gabungan sekali lagi.';
      else
        raise;
      end if;
  end;

  -- (c) HADITS & DOA — slot text (bebas nilai), langsung terisi.
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order)
  select p_tenant, v.module_type::public.learning_module, v.slot, v.content, v.sort_order
  from (values
    ('HADITS', 'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    ('HADITS', 'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    ('HADITS', 'BACAAN',            'Bacaan sudah lancar', 3),
    ('HADITS', 'BACAAN',            'Bacaan cukup lancar', 4),
    ('HADITS', 'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    ('HADITS', 'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    ('HADITS', 'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    ('HADITS', 'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    ('HADITS', 'SEMANGAT',          'Semangat belajar sangat baik', 9),
    ('HADITS', 'SEMANGAT',          'Perlu motivasi lebih', 10),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13),
    ('DOA',    'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    ('DOA',    'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    ('DOA',    'BACAAN',            'Bacaan sudah lancar', 3),
    ('DOA',    'BACAAN',            'Bacaan cukup lancar', 4),
    ('DOA',    'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    ('DOA',    'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    ('DOA',    'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    ('DOA',    'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    ('DOA',    'SEMANGAT',          'Semangat belajar sangat baik', 9),
    ('DOA',    'SEMANGAT',          'Perlu motivasi lebih', 10),
    ('DOA',    'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    ('DOA',    'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    ('DOA',    'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13)
  ) as v(module_type, slot, content, sort_order)
  where not exists (
    select 1 from public.learning_note_templates t
    where t.tenant_id = p_tenant
      and t.module_type::text = v.module_type
      and t.slot = v.slot
      and t.content = v.content
  );
end;
$$;

-- Jalankan seed untuk semua lembaga (guard per-tenant: satu lembaga gagal
-- tidak menggagalkan seluruh file — cukup warning, lembaga lain tetap terisi).
do $$
declare
  v_tenant record;
begin
  if to_regprocedure('public.setoran_seed_template_labels(uuid)') is null then
    raise notice 'SKIP seed template labels: fungsi belum ada.';
  else
    for v_tenant in select id from public.tenants loop
      begin
        perform public.setoran_seed_template_labels(v_tenant.id);
      exception when others then
        raise warning 'setoran_seed_template_labels gagal untuk tenant %: %', v_tenant.id, sqlerrm;
      end;
    end loop;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Seed LEMBAGA BARU memakai set baru ini (ganti fungsi trigger lama)
-- ---------------------------------------------------------------------------

-- Tahfidz (V5 trigger) — set baru, tanpa titik akhiran.
create or replace function public.tahfidz_seed_submission_templates()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order) values
    (new.id, 'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    (new.id, 'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    (new.id, 'BACAAN',            'Bacaan sudah lancar', 3),
    (new.id, 'BACAAN',            'Bacaan cukup lancar', 4),
    (new.id, 'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    (new.id, 'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    (new.id, 'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    (new.id, 'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    (new.id, 'SEMANGAT',          'Semangat belajar sangat baik', 9),
    (new.id, 'SEMANGAT',          'Perlu motivasi lebih', 10),
    (new.id, 'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    (new.id, 'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    (new.id, 'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13)
  on conflict do nothing;
  return new;
end;
$$;

-- Learning (V6 trigger) — HADITS & DOA memakai set baru; TAJWID tetap.
create or replace function public.learning_seed_note_templates()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- HADITS — set baru (label sesuai contoh)
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order) values
    (new.id, 'HADITS', 'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    (new.id, 'HADITS', 'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    (new.id, 'HADITS', 'BACAAN',            'Bacaan sudah lancar', 3),
    (new.id, 'HADITS', 'BACAAN',            'Bacaan cukup lancar', 4),
    (new.id, 'HADITS', 'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    (new.id, 'HADITS', 'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    (new.id, 'HADITS', 'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    (new.id, 'HADITS', 'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    (new.id, 'HADITS', 'SEMANGAT',          'Semangat belajar sangat baik', 9),
    (new.id, 'HADITS', 'SEMANGAT',          'Perlu motivasi lebih', 10),
    (new.id, 'HADITS', 'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    (new.id, 'HADITS', 'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    (new.id, 'HADITS', 'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13),
  -- DOA HARIAN — set baru
    (new.id, 'DOA', 'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    (new.id, 'DOA', 'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    (new.id, 'DOA', 'BACAAN',            'Bacaan sudah lancar', 3),
    (new.id, 'DOA', 'BACAAN',            'Bacaan cukup lancar', 4),
    (new.id, 'DOA', 'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    (new.id, 'DOA', 'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    (new.id, 'DOA', 'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    (new.id, 'DOA', 'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    (new.id, 'DOA', 'SEMANGAT',          'Semangat belajar sangat baik', 9),
    (new.id, 'DOA', 'SEMANGAT',          'Perlu motivasi lebih', 10),
    (new.id, 'DOA', 'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    (new.id, 'DOA', 'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    (new.id, 'DOA', 'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13),
  -- TAJWID (rule #19) — tidak berubah
    (new.id, 'TAJWID', 'PEMAHAMAN', 'Sudah memahami kaidah tajwid ini.', 1),
    (new.id, 'TAJWID', 'PENERAPAN', 'Perlu latihan penerapan saat membaca Al-Qur''an.', 2),
    (new.id, 'TAJWID', 'KESALAHAN',  'Masih terdapat kesalahan pada penerapan kaidah.', 3),
    (new.id, 'TAJWID', 'SARAN',      'Perbanyak latihan membaca dengan memperhatikan kaidah.', 4),
    (new.id, 'TAJWID', 'CATATAN_ORANG_TUA', 'Mohon mendampingi latihan membaca Al-Qur''an di rumah.', 5)
  on conflict do nothing;
  return new;
end;
$$;

-- Backfill default (dipakai patch perbaikan) — set baru agar konsisten.
create or replace function public.tahfidz_backfill_submission_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tahfidz_submission_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.submission_note_slot, v.content, v.sort_order
  from (values
    ('APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    ('APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    ('BACAAN',            'Bacaan sudah lancar', 3),
    ('BACAAN',            'Bacaan cukup lancar', 4),
    ('BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    ('TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    ('TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    ('TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    ('SEMANGAT',          'Semangat belajar sangat baik', 9),
    ('SEMANGAT',          'Perlu motivasi lebih', 10),
    ('CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    ('CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    ('CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13)
  ) as v(slot, content, sort_order)
  where not exists (select 1 from public.tahfidz_submission_templates t where t.tenant_id = p_tenant);
end;
$$;

create or replace function public.learning_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.learning_note_templates (tenant_id, module_type, slot, content, sort_order)
  select p_tenant, v.module_type::public.learning_module, v.slot, v.content, v.sort_order
  from (values
    ('HADITS', 'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    ('HADITS', 'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    ('HADITS', 'BACAAN',            'Bacaan sudah lancar', 3),
    ('HADITS', 'BACAAN',            'Bacaan cukup lancar', 4),
    ('HADITS', 'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    ('HADITS', 'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    ('HADITS', 'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    ('HADITS', 'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    ('HADITS', 'SEMANGAT',          'Semangat belajar sangat baik', 9),
    ('HADITS', 'SEMANGAT',          'Perlu motivasi lebih', 10),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    ('HADITS', 'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13),
    ('DOA',    'APRESIASI',         'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam hafalannya', 1),
    ('DOA',    'APRESIASI',         'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini', 2),
    ('DOA',    'BACAAN',            'Bacaan sudah lancar', 3),
    ('DOA',    'BACAAN',            'Bacaan cukup lancar', 4),
    ('DOA',    'BACAAN',            'Bacaan kurang lancar, perlu diulang', 5),
    ('DOA',    'TAJWID_FASHAHAH',   'Tajwid sudah baik', 6),
    ('DOA',    'TAJWID_FASHAHAH',   'Fashahah bagus', 7),
    ('DOA',    'TAJWID_FASHAHAH',   'Perlu perbaikan makhraj huruf', 8),
    ('DOA',    'SEMANGAT',          'Semangat belajar sangat baik', 9),
    ('DOA',    'SEMANGAT',          'Perlu motivasi lebih', 10),
    ('DOA',    'CATATAN_ORANG_TUA', 'Mohon orang tua mendampingi ananda {nama} muroja''ah di rumah', 11),
    ('DOA',    'CATATAN_ORANG_TUA', 'Mohon hafalan ananda {nama} lebih sering diulang di rumah', 12),
    ('DOA',    'CATATAN_ORANG_TUA', 'Perlu bimbingan tambahan di rumah agar hafalan ananda {nama} lebih lancar', 13),
    ('TAJWID', 'PEMAHAMAN', 'Sudah memahami kaidah tajwid ini.', 1),
    ('TAJWID', 'PENERAPAN', 'Perlu latihan penerapan saat membaca Al-Qur''an.', 2),
    ('TAJWID', 'KESALAHAN',  'Masih terdapat kesalahan pada penerapan kaidah.', 3),
    ('TAJWID', 'SARAN',      'Perbanyak latihan membaca dengan memperhatikan kaidah.', 4),
    ('TAJWID', 'CATATAN_ORANG_TUA', 'Mohon mendampingi latihan membaca Al-Qur''an di rumah.', 5)
  ) as v(module_type, slot, content, sort_order)
  where not exists (select 1 from public.learning_note_templates t where t.tenant_id = p_tenant);
end;
$$;

do $$ begin
  raise notice 'SEED TEMPLATE LABELS: label & contoh template cepat setoran diperbarui (idempoten — aman rerun).';
end $$;
