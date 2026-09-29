-- ============================================================================
-- TAHFIZH V51 — Jurnal Ibadah harian santri
-- ============================================================================
-- Santri/wali mengisi checklist ibadah harian: sholat 5 waktu, dhuha,
-- muraja'ah, tilawah, dst. Katalog kegiatan dikelola ADMIN/KOORDINATOR/USTADZ
-- per lembaga (ada bawaan platform, bisa ditambah sendiri).
--
-- Tabel:
--   • ibadah_activities — katalog kegiatan per tenant (atau tenant NULL =
--     bawaan platform yang ikut tampil di semua lembaga).
--   • ibadah_logs       — isian harian: unik per (student, activity, tanggal).
--
-- RPC:
--   • ibadah_activities_list()          — katalog utk tenant pemanggil.
--   • ibadah_log_page(p_from, p_to)     — isian milik anak akun ini dlm rentang.
--   • ibadah_log_upsert(...)            — simpan isian (santri/wali).
--   • ibadah_activity_save/delete(...)  — kelola katalog (admin/koor/guru).
--
-- Semua RPC SECURITY DEFINER, filter tenant dari profil pemanggil.
-- Idempoten: drop + create ulang.
-- ============================================================================

-- ------------------------------------------------------------------ tables --
create table if not exists public.ibadah_activities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants (id) on delete cascade,
  -- NULL = bawaan platform (tampil di semua lembaga, tidak bisa dihapus lembaga lain)
  label      text not null check (char_length(label) between 2 and 60),
  icon       text not null default 'check',
  tone       text not null default 'emerald',
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ibadah_activities_tenant_idx on public.ibadah_activities (tenant_id);

create table if not exists public.ibadah_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  activity_id uuid not null references public.ibadah_activities (id) on delete cascade,
  log_date    date not null,
  done        boolean not null default true,
  note        text,
  filled_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, activity_id, log_date)
);

create index if not exists ibadah_logs_student_idx on public.ibadah_logs (student_id, log_date desc);
create index if not exists ibadah_logs_tenant_idx  on public.ibadah_logs (tenant_id, log_date desc);

alter table public.ibadah_activities enable row level security;
alter table public.ibadah_logs enable row level security;

-- RLS ringkas: tulis hanya lewat RPC SECURITY DEFINER; baca langsung dibatasi tenant.
do $$ begin
  create policy ibadah_activities_read on public.ibadah_activities
    for select using (tenant_id is null or tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy ibadah_logs_read on public.ibadah_logs
    for select using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------- seed ---
-- Bawaan platform (tenant_id NULL) — hanya sekali.
insert into public.ibadah_activities (tenant_id, label, icon, tone, sort_order)
select * from (values
  (null::uuid, 'Sholat Subuh',        'moonstar', 'violet',  10),
  (null::uuid, 'Sholat Zuhur',        'sun',      'amber',   20),
  (null::uuid, 'Sholat Asar',         'sun',      'orange',  30),
  (null::uuid, 'Sholat Maghrib',      'moonstar', 'sky',     40),
  (null::uuid, 'Sholat Isya',         'moonstar', 'indigo',  50),
  (null::uuid, 'Sholat Dhuha',        'sun',      'yellow',  60),
  (null::uuid, 'Muraja''ah',          'repeat',   'emerald', 70),
  (null::uuid, 'Tilawah',             'bookopen', 'blue',    80)
) as v(tenant_id, label, icon, tone, sort_order)
where not exists (select 1 from public.ibadah_activities where tenant_id is null);

-- -------------------------------------------------------------------- RPCs --
drop function if exists public.ibadah_activities_list();

create or replace function public.ibadah_activities_list()
returns table (
  id uuid, label text, icon text, tone text, sort_order integer, is_active boolean, is_builtin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.label, a.icon, a.tone, a.sort_order, a.is_active,
         (a.tenant_id is null) as is_builtin
  from public.ibadah_activities a
  where a.tenant_id is null
     or a.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  order by a.tenant_id is not null, a.sort_order, a.label;
$$;

grant execute on function public.ibadah_activities_list() to authenticated;

-- Isian milik anak akun ini (wali: semua anaknya; admin/koor/guru: lihat via UI lain).
drop function if exists public.ibadah_log_page(date, date);

create or replace function public.ibadah_log_page(p_from date, p_to date)
returns table (
  student_id uuid, activity_id uuid, log_date date, done boolean, note text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.student_id, l.activity_id, l.log_date, l.done, l.note
  from public.ibadah_logs l
  join public.guardian_students gs on gs.student_id = l.student_id
  join public.guardians g on g.id = gs.guardian_id
  where g.profile_id = auth.uid()
    and l.log_date between p_from and p_to;
$$;

grant execute on function public.ibadah_log_page(date, date) to authenticated;

-- Simpan satu centang (upsert). Santri/wali hanya boleh utk anaknya sendiri,
-- hari ini atau kemarin (koreksi) — bukan masa depan.
drop function if exists public.ibadah_log_upsert(uuid, uuid, date, boolean, text);

create or replace function public.ibadah_log_upsert(
  p_student_id uuid, p_activity_id uuid, p_date date, p_done boolean, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_ok     boolean;
  v_act    public.ibadah_activities;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  -- Kegiatan harus milik tenant ini atau bawaan platform & aktif.
  select * into v_act from public.ibadah_activities
  where id = p_activity_id and is_active
    and (tenant_id = v_tenant or tenant_id is null);
  if v_act is null then raise exception 'AKTIVITAS_TIDAK_TERSEDIA'; end if;

  -- Wali: hanya anaknya; admin/koor/ustadz: semua santri tenant (bantu isi).
  if v_role = 'WALI_SANTRI' then
    select exists (
      select 1 from public.guardian_students gs
      join public.guardians g on g.id = gs.guardian_id
      where g.profile_id = v_uid and gs.student_id = p_student_id
    ) into v_ok;
    if not v_ok then raise exception 'AKSES_DITOLAK'; end if;
    -- Bandingkan dengan tanggal WIB, bukan current_date UTC — pagi hari WIB
    -- (sebelum ~07.00) tanggal UTC masih kemarin sehingga isian "hari ini"
    -- keliru ditolak sebagai tanggal futur.
    if p_date > (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'TANGGAL_FUTUR';
    end if;
  end if;

  insert into public.ibadah_logs (tenant_id, student_id, activity_id, log_date, done, note, filled_by)
  values (v_tenant, p_student_id, p_activity_id, p_date, p_done, nullif(btrim(coalesce(p_note, '')), ''), v_uid)
  on conflict (student_id, activity_id, log_date)
  do update set done = excluded.done, note = excluded.note, filled_by = excluded.filled_by;
end;
$$;

grant execute on function public.ibadah_log_upsert(uuid, uuid, date, boolean, text) to authenticated;

-- Kelola katalog tenant (admin/koordinator/ustadz). Bawaan platform tidak bisa diubah.
drop function if exists public.ibadah_activity_save(text, text, text, integer);

create or replace function public.ibadah_activity_save(
  p_label text, p_icon text default 'check', p_tone text default 'emerald', p_sort integer default 100
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'KOORDINATOR', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_label is null or char_length(btrim(p_label)) < 2 or char_length(btrim(p_label)) > 60 then
    raise exception 'LABEL_TIDAK_VALID';
  end if;

  insert into public.ibadah_activities (tenant_id, label, icon, tone, sort_order)
  values (v_tenant, btrim(p_label), coalesce(p_icon, 'check'), coalesce(p_tone, 'emerald'), coalesce(p_sort, 100))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ibadah_activity_save(text, text, text, integer) to authenticated;

drop function if exists public.ibadah_activity_delete(uuid);

create or replace function public.ibadah_activity_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'KOORDINATOR', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;
  delete from public.ibadah_activities
  where id = p_id and tenant_id = v_tenant;
end;
$$;

grant execute on function public.ibadah_activity_delete(uuid) to authenticated;
