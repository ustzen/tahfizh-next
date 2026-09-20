-- ============================================================================
-- TAHFIZH V12 — TARTIL: slot catatan lengkap + template 2 per kategori + opsi
-- nilai huruf.
--
-- PENTING (lesson learned): Supabase SQL Editor menjalankan seluruh skrip
-- dalam SATU transaksi. `ALTER TYPE ... ADD VALUE` di PG 12+ boleh di dalam
-- transaksi, tetapi nilai barunya TIDAK BOLEH dipakai di transaksi yang sama
-- ("unsafe use of new value"). Karena itu:
--   * Tidak ada backfill/seed yang memakai nilai enum baru saat migrasi.
--   * Seeding dilakukan lewat FUNGSI (dipanggil runtime: trigger tenant baru +
--     panggilan lazy dari aplikasi) — aman karena berjalan di transaksi lain.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Slot enum baru (idempoten via cek pg_enum)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tartil_note_slot' and e.enumlabel = 'TAJWID'
  ) then
    alter type public.tartil_note_slot add value 'TAJWID';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tartil_note_slot' and e.enumlabel = 'KELANCARAN'
  ) then
    alter type public.tartil_note_slot add value 'KELANCARAN';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tartil_note_slot' and e.enumlabel = 'SEMANGAT'
  ) then
    alter type public.tartil_note_slot add value 'SEMANGAT';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Bersihkan template seed LAMA (1 per slot, versi V4) agar tiap kategori
--    mendapat default PAS 2 template. Hanya template seed yang MASIH ASLI
--    (teks persis sama) yang dihapus — hasil edit guru tidak disentuh.
-- ----------------------------------------------------------------------------
delete from public.tartil_note_templates
where content in (
  'Alhamdulillah, bacaan ananda sudah semakin baik.',
  'Perhatikan panjang pendek bacaan (mad & harakat).',
  'Perhatikan makhraj huruf.',
  'Latihan membaca secara rutin.',
  'Mohon pendampingan membaca di rumah.',
  -- sisa seed antara (rampung 2/kategori):
  'Bacaan kurang lancar, perlu diulang.',
  'Perlu perbaikan pada hukum bacaan.',
  'Cukup lancar.'
);

-- ----------------------------------------------------------------------------
-- 3. Seed template PAS 2 per kategori (runtime; per-slot guard — slot yang
--    sudah diisi guru TIDAK ditimpa/diduplikasi).
-- ----------------------------------------------------------------------------
create or replace function public.tartil_seed_note_templates_v2(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tartil_note_templates (tenant_id, slot, content, sort_order)
  select p_tenant, v.slot::public.tartil_note_slot, v.content, v.sort_order
  from (values
    -- APRESIASI
    ('APRESIASI', 'Alhamdulillah ananda {nama} semakin berkembang dengan baik dalam bacaannya.', 11),
    ('APRESIASI', 'MasyaAllah, ananda {nama} menunjukkan usaha dan semangat yang luar biasa hari ini.', 12),
    -- BACAAN
    ('BACAAN', 'Bacaan sudah lancar dan jelas.', 21),
    ('BACAAN', 'Bacaan masih terbata-bata.', 22),
    -- TAJWID
    ('TAJWID', 'Tajwid sudah baik.', 31),
    ('TAJWID', 'Perlu perbaikan pada makhraj huruf.', 32),
    -- KELANCARAN
    ('KELANCARAN', 'Sangat lancar.', 41),
    ('KELANCARAN', 'Perlu banyak latihan.', 42),
    -- SEMANGAT
    ('SEMANGAT', 'Semangat belajar sangat baik.', 51),
    ('SEMANGAT', 'Perlu motivasi lebih.', 52),
    -- FASHOHAH
    ('FASHOHAH', 'Fashohah sudah baik, perhatikan makhraj huruf.', 61),
    ('FASHOHAH', 'Perhatikan panjang-pendek bacaan (mad & harakat).', 62),
    -- SARAN UNTUK ORANG TUA
    ('SARAN', 'Mohon orang tua mendampingi ananda {nama} mengaji di rumah.', 71),
    ('SARAN', 'Mohon bacaan ananda {nama} lebih sering diulang di rumah.', 72),
    -- CATATAN_ORANG_TUA
    ('CATATAN_ORANG_TUA', 'Mohon pendampingan membaca di rumah.', 81),
    ('CATATAN_ORANG_TUA', 'Mohon bacaan ananda {nama} diulang di rumah setiap hari.', 82)
  ) as v(slot, content, sort_order)
  where not exists (
    select 1 from public.tartil_note_templates t
    where t.tenant_id = p_tenant and t.slot::text = v.slot
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Trigger seed tenant BARU (materi + metode + template v2)
-- ----------------------------------------------------------------------------
create or replace function public.tenants_tartil_seed_note_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tartil_seed_note_templates_v2(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_tartil_seed_note_v2 on public.tenants;
create trigger tenants_tartil_seed_note_v2
  after insert on public.tenants
  for each row execute function public.tenants_tartil_seed_note_v2();

-- Trigger seed materi V4 diringkas: hanya materi (template kini dari v2).
create or replace function public.tartil_seed_materials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tartil_materials (tenant_id, name, jilid, sort_order) values
    (new.id, 'Iqra Jilid 1', '1', 1),
    (new.id, 'Iqra Jilid 2', '2', 2),
    (new.id, 'Iqra Jilid 3', '3', 3),
    (new.id, 'Iqra Jilid 4', '4', 4),
    (new.id, 'Iqra Jilid 5', '5', 5),
    (new.id, 'Iqra Jilid 6', '6', 6),
    (new.id, 'Al-Qur''an',   null, 7)
  on conflict (tenant_id, name) do nothing;
  return new;
end;
$$;

-- Backfill default V4 diperbarui: template v2 ikut di-backfill (runtime).
create or replace function public.tartil_backfill_defaults(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tartil_seed_note_templates_v2(p_tenant);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC template save: validasi slot via CAST ke enum (bukan daftar teks)
--    agar slot baru (TAJWID/KELANCARAN/SEMANGAT & selanjutnya) otomatis valid.
-- ----------------------------------------------------------------------------
create or replace function public.tartil_note_template_save(
  p_id      uuid,   -- null = baru
  p_slot    text,
  p_content text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'USTADZ', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  begin
    perform p_slot::public.tartil_note_slot;
  exception when others then
    raise exception 'SLOT_CATATAN_TIDAK_VALID';
  end;
  if btrim(p_content) = '' or char_length(btrim(p_content)) > 300 then
    raise exception 'ISI_TEMPLATE_TIDAK_VALID';
  end if;

  if p_id is null then
    insert into public.tartil_note_templates (tenant_id, slot, content, is_active)
    values (v_tenant, p_slot::public.tartil_note_slot, btrim(p_content), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.tartil_note_templates t
    set slot = p_slot::public.tartil_note_slot,
        content = btrim(p_content),
        is_active = coalesce(p_is_active, true)
    where t.id = p_id and t.tenant_id = v_tenant
    returning t.id into v_id;
    if v_id is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. PENGATURAN MODE NILAI TARTIL — per lembaga, TERPISAH dari mode Tahfidz.
--    Memakai enum tahfidz_mode (nilai CENTANG/HURUF/ANGKA sama). Default
--    CENTANG; baris tidak wajib ada (fallback CENTANG di aplikasi).
-- ----------------------------------------------------------------------------
create table if not exists public.tartil_settings (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  mode       public.tahfidz_mode not null default 'CENTANG',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tartil_settings_updated_at on public.tartil_settings;
do $tfx$
begin
  execute 'create trigger tartil_settings_updated_at
    before update on public.tartil_settings
    for each row execute function public.touch_updated_at()';
exception
  when duplicate_object then null;
end
$tfx$;

alter table public.tartil_settings enable row level security;

drop policy if exists tartil_settings_select on public.tartil_settings;
create policy tartil_settings_select on public.tartil_settings
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

drop policy if exists tartil_settings_admin_write on public.tartil_settings;
create policy tartil_settings_admin_write on public.tartil_settings
  for all to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
  )
  with check (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
  );

grant select on public.tartil_settings to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Opsi nilai huruf (A+ … D) untuk tenant yang belum punya grade settings
--    (tidak memakai nilai enum baru — aman dalam satu transaksi).
-- ----------------------------------------------------------------------------
do $$
declare
  t uuid;
  v_has_grades boolean;
begin
  select count(*) > 0 into v_has_grades
  from pg_tables where schemaname = 'public' and tablename = 'tahfidz_grade_settings';
  if v_has_grades then
    for t in
      select id from public.tenants tt
      where not exists (
        select 1 from public.tahfidz_grade_settings g where g.tenant_id = tt.id
      )
    loop
      insert into public.tahfidz_grade_settings (tenant_id, label, min_value, max_value, sort_order) values
        (t, 'A+', 96, 100, 1),
        (t, 'A',  91, 95, 2),
        (t, 'A-', 86, 90, 3),
        (t, 'B+', 81, 85, 4),
        (t, 'B',  76, 80, 5),
        (t, 'B-', 71, 75, 6),
        (t, 'C+', 66, 70, 7),
        (t, 'C',  61, 65, 8),
        (t, 'C-', 56, 60, 9),
        (t, 'D',   1, 55, 10);
    end loop;
  end if;
end $$;
