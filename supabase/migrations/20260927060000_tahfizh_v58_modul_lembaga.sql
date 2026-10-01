-- ============================================================================
-- TAHFIZH V58 — Modul lembaga kustom (di luar modul bawaan)
-- ============================================================================
-- Lembaga bisa menambah modul sendiri selain Tahfidz/Tugas/Hadits/Doa/Tajwid
-- (mis. "Kaligrafi", "Bahasa Arab"). Modul tampil sebagai tile di dasbor
-- santri dengan progres: jumlah catatan poin santri vs target poin modul.
--
-- Tabel:
--   • custom_modules     — katalog modul lembaga (label, ikon, warna,
--                          target poin, urutan, aktif).
--   • custom_module_logs — catatan poin per santri per modul (1 baris =
--                          1 poin; guru/admin/koor/wali mencatat lewat RPC).
--
-- RPC:
--   • custom_module_list(p_all)      — katalog utk tenant pemanggil.
--   • custom_module_save/delete      — kelola katalog (admin/koordinator).
--   • custom_module_log_save/delete  — catat/hapus poin (guru: halaqahnya,
--                                      admin/koor: lembaga, wali: anaknya).
--   • custom_module_log_page(limit)  — riwayat catatan terbaru utk guru.
--   • custom_module_counts()         — jumlah poin per modul per anak (wali).
--
-- Idempoten: drop + create ulang. SECURITY DEFINER, tenant dari profil.
-- ============================================================================

-- ------------------------------------------------------------------ tables --
create table if not exists public.custom_modules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  label       text not null check (char_length(label) between 2 and 40),
  icon        text not null default 'star',
  tone        text not null default 'emerald',
  poin_target integer not null default 0 check (poin_target between 0 and 10000),
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists custom_modules_tenant_idx on public.custom_modules (tenant_id, is_active, sort_order);

create table if not exists public.custom_module_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  module_id   uuid not null references public.custom_modules (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  log_date    date not null,
  note        text check (char_length(note) <= 300),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists custom_module_logs_module_idx on public.custom_module_logs (module_id, student_id);
create index if not exists custom_module_logs_tenant_idx on public.custom_module_logs (tenant_id, created_at desc);

alter table public.custom_modules enable row level security;
alter table public.custom_module_logs enable row level security;

-- Baca langsung dibatasi tenant; tulis hanya lewat RPC SECURITY DEFINER.
do $$ begin
  create policy custom_modules_read on public.custom_modules
    for select using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy custom_module_logs_read on public.custom_module_logs
    for select using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------- RPCs --
drop function if exists public.custom_module_list(boolean);

create or replace function public.custom_module_list(p_all boolean default false)
returns table (
  id uuid, label text, icon text, tone text, poin_target integer, sort_order integer, is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.label, m.icon, m.tone, m.poin_target, m.sort_order, m.is_active
  from public.custom_modules m
  where m.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (p_all or m.is_active)
  order by m.sort_order, m.label;
$$;

grant execute on function public.custom_module_list(boolean) to authenticated;

drop function if exists public.custom_module_save(uuid, text, text, text, integer, integer);

-- p_id wajib dikirim (NULL = tambah baru) — parameter berdefault harus di akhir.
create or replace function public.custom_module_save(
  p_id         uuid,
  p_label      text,
  p_icon       text default 'star',
  p_tone       text default 'emerald',
  p_poin_target integer default 0,
  p_sort       integer default 100
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
  v_label  text;
  v_icon   text;
  v_tone   text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if v_label is null or char_length(v_label) < 2 or char_length(v_label) > 40 then
    raise exception 'LABEL_TIDAK_VALID';
  end if;

  v_icon := nullif(btrim(coalesce(p_icon, '')), '');
  v_icon := coalesce(v_icon, 'star');
  if char_length(v_icon) > 24 then raise exception 'LABEL_TIDAK_VALID'; end if;

  v_tone := coalesce(nullif(btrim(coalesce(p_tone, '')), ''), 'emerald');
  if v_tone not in ('emerald', 'blue', 'sky', 'violet', 'amber', 'orange', 'rose', 'teal', 'cyan', 'indigo') then
    v_tone := 'emerald';
  end if;

  if coalesce(p_poin_target, 0) < 0 or coalesce(p_poin_target, 0) > 10000 then
    raise exception 'LABEL_TIDAK_VALID';
  end if;

  if p_id is null then
    insert into public.custom_modules (tenant_id, label, icon, tone, poin_target, sort_order)
    values (v_tenant, v_label, v_icon, v_tone, coalesce(p_poin_target, 0), coalesce(p_sort, 100))
    returning id into v_id;
  else
    update public.custom_modules m
    set label = v_label, icon = v_icon, tone = v_tone,
        poin_target = coalesce(p_poin_target, 0), sort_order = coalesce(p_sort, 100),
        updated_at = now()
    where m.id = p_id and m.tenant_id = v_tenant
    returning m.id into v_id;
    if v_id is null then raise exception 'MODUL_TIDAK_DITEMUKAN'; end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.custom_module_save(uuid, text, text, text, integer, integer) to authenticated;

drop function if exists public.custom_module_delete(uuid);

create or replace function public.custom_module_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  delete from public.custom_modules
  where id = p_id and tenant_id = v_tenant;
end;
$$;

grant execute on function public.custom_module_delete(uuid) to authenticated;

-- Catat 1 poin (guru: halaqah diampu; admin/koor: lembaga; wali: anaknya).
drop function if exists public.custom_module_log_save(uuid, uuid, date, text);

create or replace function public.custom_module_log_save(
  p_student_id uuid,
  p_module_id  uuid,
  p_log_date   date,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_ok       boolean;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN', 'WALI_SANTRI') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Modul harus milik lembaga ini dan aktif.
  if not exists (
    select 1 from public.custom_modules m
    where m.id = p_module_id and m.tenant_id = v_tenant and m.is_active
  ) then raise exception 'MODUL_TIDAK_DITEMUKAN'; end if;

  -- Cakupan santri.
  if v_role = 'WALI_SANTRI' then
    select exists (
      select 1 from public.guardian_students gs
      join public.guardians g on g.id = gs.guardian_id
      where g.profile_id = v_uid and gs.student_id = p_student_id
    ) into v_ok;
    if not v_ok then raise exception 'SANTRI_TIDAK_VALID'; end if;
  elsif v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then raise exception 'AKSES_DITOLAK'; end if;
    select exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher and hs.student_id = p_student_id
    ) into v_ok;
    if not v_ok then raise exception 'SANTRI_TIDAK_VALID'; end if;
  else
    if not exists (
      select 1 from public.students s
      where s.id = p_student_id and s.tenant_id = v_tenant
    ) then raise exception 'SANTRI_TIDAK_VALID'; end if;
  end if;

  if p_log_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'TANGGAL_FUTUR';
  end if;

  insert into public.custom_module_logs (tenant_id, module_id, student_id, log_date, note, recorded_by)
  values (v_tenant, p_module_id, p_student_id, p_log_date,
          nullif(btrim(coalesce(p_note, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.custom_module_log_save(uuid, uuid, date, text) to authenticated;

drop function if exists public.custom_module_log_delete(uuid);

create or replace function public.custom_module_log_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_teacher uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  if v_role in ('ADMIN', 'KOORDINATOR') then
    delete from public.custom_module_logs
    where id = p_id and tenant_id = v_tenant;
    return;
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is not null then
      delete from public.custom_module_logs l
      where l.id = p_id and l.tenant_id = v_tenant
        and exists (
          select 1 from public.halaqah_teachers ht
          join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
          where ht.teacher_id = v_teacher and hs.student_id = l.student_id
        );
      return;
    end if;
  end if;

  -- Pencatat boleh menghapus catatannya sendiri.
  delete from public.custom_module_logs
  where id = p_id and recorded_by = v_uid;
end;
$$;

grant execute on function public.custom_module_log_delete(uuid) to authenticated;

-- Riwayat catatan terbaru untuk guru/admin/koordinator.
drop function if exists public.custom_module_log_page(integer);

create or replace function public.custom_module_log_page(p_limit integer default 50)
returns table (
  id uuid, module_id uuid, module_label text, student_id uuid,
  student_name text, log_date date, note text, created_at timestamptz
)
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
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then return; end if;
  end if;

  return query
    select l.id, l.module_id, m.label, l.student_id, s.full_name,
           l.log_date, l.note, l.created_at
    from public.custom_module_logs l
    join public.custom_modules m on m.id = l.module_id
    join public.students s on s.id = l.student_id
    where l.tenant_id = v_tenant
      and (v_role <> 'USTADZ' or exists (
        select 1 from public.halaqah_teachers ht
        join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
        where ht.teacher_id = v_teacher and hs.student_id = l.student_id
      ))
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.custom_module_log_page(integer) to authenticated;

-- Jumlah poin per modul per anak (wali) — untuk dasbor santri.
drop function if exists public.custom_module_counts();

create or replace function public.custom_module_counts()
returns table (module_id uuid, student_id uuid, cnt integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.module_id, l.student_id, count(*)::int as cnt
  from public.custom_module_logs l
  join public.guardian_students gs on gs.student_id = l.student_id
  join public.guardians g on g.id = gs.guardian_id
  join public.custom_modules m on m.id = l.module_id and m.is_active
  where g.profile_id = auth.uid()
    and l.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  group by l.module_id, l.student_id;
$$;

grant execute on function public.custom_module_counts() to authenticated;
