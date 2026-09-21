-- ============================================================================
-- TAHFIZH V19 — Akun santri SELALU tertaut ke datanya sendiri
--
-- V16 sudah menautkan otomatis lewat trigger pada students.login_username,
-- tapi masih menyisakan celah: bila profil akun dibuat/diubah SETELAH baris
-- santri tersimpan (import, pendaftaran mandiri, login Google, perbaikan
-- username), atau bila login_username santri belum pernah diisi sama sekali,
-- akun tetap tampil "belum terhubung".
--
-- V19 menutup celah itu dengan tiga lapis:
--   1. Trigger pada public.profiles — arah sebaliknya dari V16.
--   2. RPC santri_ensure_self_link() — self-heal saat halaman santri dibuka,
--      termasuk pencocokan nama bila username belum tersimpan di baris santri.
--   3. Backfill satu kali untuk akun yang sudah ada.
--
-- Prinsipnya: akun santri pasti milik satu lembaga dan satu baris santri, jadi
-- penautan tidak pernah butuh langkah manual admin. Idempoten & repair-safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: tautkan satu profil santri ke baris students yang sesuai.
-- Mengembalikan jumlah anak yang tertaut untuk profil tersebut.
-- ---------------------------------------------------------------------------
create or replace function public.santri_link_profile(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile    public.profiles;
  v_guardian   uuid;
  v_student    uuid;
  v_count      integer := 0;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' or v_profile.tenant_id is null then
    return 0;
  end if;

  -- Pastikan baris guardian untuk profil ini ada.
  insert into public.guardians (tenant_id, profile_id)
  values (v_profile.tenant_id, v_profile.id)
  on conflict (profile_id) do nothing;

  select id into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is null then
    return 0;
  end if;

  -- (a) Cocokkan lewat username login santri — jalur utama.
  insert into public.guardian_students (tenant_id, guardian_id, student_id)
  select s.tenant_id, v_guardian, s.id
  from public.students s
  where s.tenant_id = v_profile.tenant_id
    and v_profile.username is not null
    and s.login_username = v_profile.username
  on conflict (guardian_id, student_id) do nothing;

  select count(*) into v_count
  from public.guardian_students where guardian_id = v_guardian;

  -- (b) Belum ketemu: cocokkan lewat nama lengkap, HANYA bila persis satu
  --     santri di lembaga ini bernama sama dan belum punya akun lain.
  if v_count = 0 then
    select s.id into v_student
    from public.students s
    where s.tenant_id = v_profile.tenant_id
      and lower(btrim(s.full_name)) = lower(btrim(v_profile.full_name))
      and coalesce(s.login_username, '') in ('', coalesce(v_profile.username, ''))
    limit 2;

    if (
      select count(*) from public.students s
      where s.tenant_id = v_profile.tenant_id
        and lower(btrim(s.full_name)) = lower(btrim(v_profile.full_name))
        and coalesce(s.login_username, '') in ('', coalesce(v_profile.username, ''))
    ) = 1 and v_student is not null then
      insert into public.guardian_students (tenant_id, guardian_id, student_id)
      values (v_profile.tenant_id, v_guardian, v_student)
      on conflict (guardian_id, student_id) do nothing;

      -- Sekalian simpan username-nya agar jalur (a) berlaku seterusnya.
      if v_profile.username is not null then
        update public.students
        set login_username = v_profile.username
        where id = v_student and coalesce(login_username, '') = '';
      end if;
    end if;

    select count(*) into v_count
    from public.guardian_students where guardian_id = v_guardian;
  end if;

  return v_count;
end;
$$;
grant execute on function public.santri_link_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Trigger pada profiles — arah kebalikan dari trigger V16.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_self_guardian_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'WALI_SANTRI' and new.tenant_id is not null then
    perform public.santri_link_profile(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_self_guardian_link_trg on public.profiles;
create trigger profiles_self_guardian_link_trg
  after insert or update of username, role, tenant_id, full_name on public.profiles
  for each row execute function public.profiles_self_guardian_link();

-- ---------------------------------------------------------------------------
-- 2. Self-heal saat halaman santri dibuka (dipanggil dari layout /santri).
-- ---------------------------------------------------------------------------
create or replace function public.santri_ensure_self_link()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 0;
  end if;
  return public.santri_link_profile(v_uid);
end;
$$;
grant execute on function public.santri_ensure_self_link() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill semua akun santri yang sudah ada.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id from public.profiles
    where role = 'WALI_SANTRI' and tenant_id is not null
  loop
    perform public.santri_link_profile(r.id);
  end loop;
end $$;
