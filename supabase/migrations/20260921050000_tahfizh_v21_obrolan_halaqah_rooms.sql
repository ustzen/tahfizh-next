-- ============================================================================
-- TAHFIZH V21 — Obrolan: ruang per Halaqah + batas 160 karakter
--
-- V20 hanya punya satu ruang per lembaga. V21 menambahkan ruang tambahan per
-- Halaqah (halaqah_id NULL tetap berarti ruang "Lembaga" — semua anggota
-- tenant). Siapa boleh masuk ruang Halaqah mana ditentukan oleh peran:
--   - ADMIN/KOORDINATOR : semua Halaqah aktif di lembaganya (pengawasan).
--   - USTADZ             : Halaqah yang ia ajar (halaqah_teachers).
--   - WALI_SANTRI         : Halaqah tempat anaknya terdaftar aktif.
-- Batas "1 lembaga" dari V20 tetap berlaku penuh untuk kedua jenis ruang.
-- Panjang pesan diperketat dari 1000 -> 160 karakter.
-- ============================================================================

alter table public.chat_messages
  add column if not exists halaqah_id uuid references public.halaqahs (id) on delete cascade;

create index if not exists chat_messages_room_idx
  on public.chat_messages (tenant_id, halaqah_id, created_at desc);

-- Perketat batas panjang pesan: 1000 -> 160 karakter.
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages
  add constraint chat_messages_content_check check (char_length(btrim(content)) between 1 and 160);

-- ---------------------------------------------------------------------------
-- Helper: apakah pengguna saat ini boleh mengakses ruang Halaqah tertentu.
-- ---------------------------------------------------------------------------
create or replace function public.chat_can_access_halaqah(p_halaqah_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_tenant        uuid := public.current_tenant_id();
  v_role          public.app_role := public.current_role();
  v_halaqah_tenant uuid;
begin
  if v_uid is null or v_tenant is null or p_halaqah_id is null then
    return false;
  end if;

  select tenant_id into v_halaqah_tenant from public.halaqahs where id = p_halaqah_id;
  if v_halaqah_tenant is null or v_halaqah_tenant <> v_tenant then
    return false;
  end if;

  if v_role in ('ADMIN', 'KOORDINATOR') then
    return true;
  end if;

  if v_role = 'USTADZ' then
    return exists (
      select 1 from public.halaqah_teachers ht
      join public.teachers t on t.id = ht.teacher_id
      where ht.halaqah_id = p_halaqah_id and t.profile_id = v_uid
    );
  end if;

  if v_role = 'WALI_SANTRI' then
    return exists (
      select 1 from public.halaqah_students hs
      join public.guardian_students gs on gs.student_id = hs.student_id
      join public.guardians g on g.id = gs.guardian_id
      where hs.halaqah_id = p_halaqah_id and hs.left_at is null and g.profile_id = v_uid
    );
  end if;

  return false;
end;
$$;
grant execute on function public.chat_can_access_halaqah(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — tambahkan syarat akses ruang Halaqah di atas syarat 1-tenant lama.
-- ---------------------------------------------------------------------------
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (halaqah_id is null or public.chat_can_access_halaqah(halaqah_id))
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and sender_id = auth.uid()
    and (halaqah_id is null or public.chat_can_access_halaqah(halaqah_id))
  );

-- ---------------------------------------------------------------------------
-- Daftar ruang yang boleh dibuka pengguna saat ini: "Lembaga" + Halaqah yang
-- relevan dengan perannya.
-- ---------------------------------------------------------------------------
create or replace function public.chat_rooms()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   public.app_role;
  v_out    jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  with halaqah_list as (
    select h.id, h.name
    from public.halaqahs h
    where h.tenant_id = v_tenant and h.status = 'ACTIVE'
      and (
        v_role in ('ADMIN', 'KOORDINATOR')
        or (
          v_role = 'USTADZ' and exists (
            select 1 from public.halaqah_teachers ht
            join public.teachers t on t.id = ht.teacher_id
            where ht.halaqah_id = h.id and t.profile_id = v_uid
          )
        )
        or (
          v_role = 'WALI_SANTRI' and exists (
            select 1 from public.halaqah_students hs
            join public.guardian_students gs on gs.student_id = hs.student_id
            join public.guardians g on g.id = gs.guardian_id
            where hs.halaqah_id = h.id and hs.left_at is null and g.profile_id = v_uid
          )
        )
      )
  )
  select
    jsonb_build_array(jsonb_build_object('id', null, 'label', 'Lembaga', 'kind', 'tenant'))
    || coalesce(
         (select jsonb_agg(jsonb_build_object('id', id, 'label', name, 'kind', 'halaqah') order by name)
          from halaqah_list),
         '[]'::jsonb
       )
  into v_out;

  return v_out;
end;
$$;
grant execute on function public.chat_rooms() to authenticated;

-- ---------------------------------------------------------------------------
-- chat_send / chat_list — tambah parameter ruang (p_halaqah_id) + batas 160.
-- Signature berubah (parameter baru), jadi fungsi lama dibuang dulu.
-- ---------------------------------------------------------------------------
drop function if exists public.chat_send(text);
drop function if exists public.chat_list(timestamptz);

create or replace function public.chat_send(p_content text, p_halaqah_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_name    text;
  v_role    public.app_role;
  v_content text := btrim(coalesce(p_content, ''));
  v_row     public.chat_messages;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if char_length(v_content) < 1 then
    raise exception 'PESAN_KOSONG';
  end if;
  if char_length(v_content) > 160 then
    v_content := left(v_content, 160);
  end if;

  select tenant_id, full_name, role into v_tenant, v_name, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_halaqah_id is not null and not public.chat_can_access_halaqah(p_halaqah_id) then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Self-purging: setiap pesan baru sekalian membersihkan pesan tenant ini
  -- (semua ruang) yang sudah lewat 24 jam.
  delete from public.chat_messages
  where tenant_id = v_tenant and created_at < now() - interval '24 hours';

  insert into public.chat_messages (tenant_id, halaqah_id, sender_id, sender_name, sender_role, content)
  values (v_tenant, p_halaqah_id, v_uid, v_name, v_role, v_content)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'halaqahId', v_row.halaqah_id, 'senderId', v_row.sender_id,
    'senderName', v_row.sender_name, 'senderRole', v_row.sender_role,
    'content', v_row.content, 'createdAt', v_row.created_at, 'isSelf', true
  );
end;
$$;
grant execute on function public.chat_send(text, uuid) to authenticated;

create or replace function public.chat_list(p_since timestamptz default null, p_halaqah_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_out    jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id into v_tenant from public.profiles where id = v_uid;
  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_halaqah_id is not null and not public.chat_can_access_halaqah(p_halaqah_id) then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_since is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'halaqahId', m.halaqah_id, 'senderId', m.sender_id,
             'senderName', m.sender_name, 'senderRole', m.sender_role,
             'content', m.content, 'createdAt', m.created_at, 'isSelf', m.sender_id = v_uid
           ) order by m.created_at asc), '[]'::jsonb)
    into v_out
    from public.chat_messages m
    where m.tenant_id = v_tenant
      and m.halaqah_id is not distinct from p_halaqah_id
      and m.created_at >= now() - interval '24 hours'
      and m.created_at > p_since;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'halaqahId', m.halaqah_id, 'senderId', m.sender_id,
             'senderName', m.sender_name, 'senderRole', m.sender_role,
             'content', m.content, 'createdAt', m.created_at, 'isSelf', m.sender_id = v_uid
           ) order by m.created_at asc), '[]'::jsonb)
    into v_out
    from (
      select * from public.chat_messages m
      where m.tenant_id = v_tenant
        and m.halaqah_id is not distinct from p_halaqah_id
        and m.created_at >= now() - interval '24 hours'
      order by m.created_at desc
      limit 200
    ) m;
  end if;

  return v_out;
end;
$$;
grant execute on function public.chat_list(timestamptz, uuid) to authenticated;
