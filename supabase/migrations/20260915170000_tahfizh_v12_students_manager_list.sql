-- ============================================================================
-- TAHFIZH V12 — RPC daftar santri untuk menu Data Santri (ADMIN/KOORDINATOR)
-- ============================================================================
-- Gejala: menu Data Santri kosong di admin/koordinator (dan guru), termasuk
-- santri yang sudah maupun belum punya halaqah. Query aplikasi sudah
-- tenant-wide, sehingga penyaringan hanya bisa datang dari policy SELECT pada
-- public.students di database live (iterasi policy lama tidak selalu
-- diperbaiki oleh supabase db push manual).
--
-- Solusi: RPC SECURITY DEFINER `students_manager_list()` yang MEMBACA profil
-- pemanggil lalu mengembalikan SEMUA santri lembaganya — ber-halaqah maupun
-- tidak — tanpa bergantung pada policy students. Tenant tetap terisolasi
-- penuh (filter tenant_id dari profil pemanggil, TANPA USING(true)).
-- Role selain ADMIN/KOORDINATOR/DEVELOPER ditolak.
--
-- Return menyertakan halaqah aktif (id + nama) agar UI bisa menampilkan
-- badge "Belum ada halaqah" untuk santri yang belum ditempatkan.
-- Idempoten: drop lalu create ulang.
-- ============================================================================

-- V12.1 (15180000): drop dulu — return type RPC diperluas (nis/nisn/wali),
-- dan `create or replace` tidak bisa mengubah return type di run ulang.
drop function if exists public.students_manager_list();

create or replace function public.students_manager_list()
returns table (
  id            uuid,
  business_code text,
  full_name     text,
  nickname      text,
  gender        public.gender_type,
  status        public.entity_status,
  halaqah_id    uuid,
  halaqah_name  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return query
    select s.id, s.business_code, s.full_name, s.nickname, s.gender, s.status,
           hs.halaqah_id, h.name
    from public.students s
    left join lateral (
      select h0.halaqah_id
      from public.halaqah_students h0
      where h0.student_id = s.id and h0.left_at is null
      limit 1
    ) hs on true
    left join public.halaqahs h on h.id = hs.halaqah_id
    where s.tenant_id = v_tenant::uuid
    order by s.business_code;
end;
$$;

grant execute on function public.students_manager_list() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC daftar santri binaan guru (menu /ustadz/santri): binaan = anggota aktif
-- dari semua halaqah yang diampu. SECURITY DEFINER + verifikasi role/tenant
-- dari profil pemanggil — tidak bergantung pada policy students (view
-- teacher_students security_invoker ikut terkena policy students di embedded
-- join, sehingga daftar guru juga bisa kosong ketika policy bermasalah).
-- ----------------------------------------------------------------------------
-- Drop dulu: return type RPC ini berubah antar versi migration (V12.1
-- menambah kolom NIS/NISN/wali) — create or replace saja gagal dengan
-- "cannot change return type of existing function" saat file di-run ulang.
drop function if exists public.teacher_students_list();

create or replace function public.teacher_students_list()
returns table (
  id            uuid,
  business_code text,
  full_name     text,
  gender        public.gender_type,
  status        public.entity_status,
  halaqah_id    uuid,
  halaqah_name  text
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
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    return;
  end if;

  return query
    select distinct s.id, s.business_code, s.full_name, s.gender, s.status,
           h.id, h.name
    from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    join public.students s on s.id = hs.student_id
    join public.halaqahs h on h.id = ht.halaqah_id
    where ht.teacher_id = v_teacher
      and ht.tenant_id = v_tenant
      and s.tenant_id = v_tenant
    order by s.business_code;
end;
$$;

grant execute on function public.teacher_students_list() to authenticated;
