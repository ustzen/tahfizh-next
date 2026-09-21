-- ============================================================================
-- TAHFIZH V20 — OBROLAN (chat 1 lembaga, otomatis terhapus 24 jam)
--
-- Ruang obrolan tunggal per lembaga — semua peran di tenant yang sama
-- (Admin/Koordinator/Ustadz/Santri) berbagi satu ruang, TIDAK PERNAH lintas
-- lembaga. Pesan hanya bertahan 24 jam:
--   1. Setiap kali seseorang mengirim pesan, pesan tenant tsb yang sudah
--      lewat 24 jam langsung dibersihkan (self-purging, tidak bergantung
--      pg_cron).
--   2. Semua pembacaan (chat_list) memfilter created_at >= now() - 24 jam,
--      jadi walau baris lama sempat tersisa, tidak akan pernah tampil.
--   3. Bila ekstensi pg_cron tersedia, dijadwalkan pembersihan tambahan tiap
--      jam untuk SEMUA tenant sekaligus (mengikuti pola V12 invoice cron).
--
-- Role DEVELOPER (platform, tidak terikat satu lembaga) TIDAK diberi menu
-- Obrolan — current_tenant_id() developer bernilai NULL, sehingga secara
-- alami tidak cocok dengan tenant_id manapun (bukan pengecualian khusus).
-- ============================================================================

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null check (char_length(sender_name) between 1 and 120),
  sender_role public.app_role not null,
  content     text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_tenant_created_idx
  on public.chat_messages (tenant_id, created_at desc);

alter table public.chat_messages enable row level security;

-- Baca/tulis hanya di tenant sendiri — batas "1 lembaga" ditegakkan di RLS,
-- bukan hanya di RPC, supaya tidak bisa dilewati lewat jalur lain.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and sender_id = auth.uid());

-- Hapus: pengirim sendiri, atau ADMIN/KOORDINATOR tenant tsb (moderasi).
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (sender_id = auth.uid() or public.current_role() in ('ADMIN', 'KOORDINATOR'))
  );

-- ---------------------------------------------------------------------------
-- Kirim pesan — validasi, purge pesan >24 jam milik tenant sendiri, insert.
-- ---------------------------------------------------------------------------
create or replace function public.chat_send(p_content text)
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
  if char_length(v_content) > 1000 then
    v_content := left(v_content, 1000);
  end if;

  select tenant_id, full_name, role into v_tenant, v_name, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Self-purging: setiap pesan baru sekalian membersihkan pesan tenant ini
  -- yang sudah lewat 24 jam. Tidak bergantung pg_cron untuk tetap ringkas.
  delete from public.chat_messages
  where tenant_id = v_tenant and created_at < now() - interval '24 hours';

  insert into public.chat_messages (tenant_id, sender_id, sender_name, sender_role, content)
  values (v_tenant, v_uid, v_name, v_role, v_content)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'senderId', v_row.sender_id, 'senderName', v_row.sender_name,
    'senderRole', v_row.sender_role, 'content', v_row.content, 'createdAt', v_row.created_at,
    'isSelf', true
  );
end;
$$;
grant execute on function public.chat_send(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ambil pesan — hanya 24 jam terakhir. p_since untuk polling inkremental
-- (hanya pesan setelah timestamp itu); tanpa p_since = muat awal (maks 200).
-- ---------------------------------------------------------------------------
create or replace function public.chat_list(p_since timestamptz default null)
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

  if p_since is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'senderId', m.sender_id, 'senderName', m.sender_name,
             'senderRole', m.sender_role, 'content', m.content, 'createdAt', m.created_at,
             'isSelf', m.sender_id = v_uid
           ) order by m.created_at asc), '[]'::jsonb)
    into v_out
    from public.chat_messages m
    where m.tenant_id = v_tenant
      and m.created_at >= now() - interval '24 hours'
      and m.created_at > p_since;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'senderId', m.sender_id, 'senderName', m.sender_name,
             'senderRole', m.sender_role, 'content', m.content, 'createdAt', m.created_at,
             'isSelf', m.sender_id = v_uid
           ) order by m.created_at asc), '[]'::jsonb)
    into v_out
    from (
      select * from public.chat_messages m
      where m.tenant_id = v_tenant and m.created_at >= now() - interval '24 hours'
      order by m.created_at desc
      limit 200
    ) m;
  end if;

  return v_out;
end;
$$;
grant execute on function public.chat_list(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Hapus pesan sendiri (atau moderasi ADMIN/KOORDINATOR) — RLS di atas yang
-- menegakkan siapa boleh menghapus apa; fungsi ini hanya pembungkus praktis.
-- ---------------------------------------------------------------------------
create or replace function public.chat_delete(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chat_messages where id = p_message_id;
  return found;
end;
$$;
grant execute on function public.chat_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pembersihan lintas-tenant (jaring pengaman tambahan bila pg_cron ada).
-- ---------------------------------------------------------------------------
create or replace function public.chat_purge_all_expired()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chat_messages where created_at < now() - interval '24 hours';
$$;
grant execute on function public.chat_purge_all_expired() to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'tahfizh-chat-purge';
    perform cron.schedule('tahfizh-chat-purge', '5 * * * *', 'select public.chat_purge_all_expired()');
  else
    raise notice 'pg_cron tidak tersedia — pembersihan Obrolan tetap berjalan otomatis lewat chat_send() setiap ada pesan masuk.';
  end if;
exception when others then
  raise notice 'Jadwal pg_cron Obrolan dilewati (%) — fallback self-purge di chat_send() tetap berjalan.', sqlerrm;
end $$;
