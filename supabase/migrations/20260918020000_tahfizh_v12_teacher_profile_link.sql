-- ============================================================================
-- TAHFIZH V12.11 — RELASI GURU ↔ PROFIL VIA UUID (akar masalah data kosong)
-- ============================================================================
-- Masalah: seluruh modul (tahfidz/tartil/setoran/hadits/doa/tajwid/target/
-- tugas/jurnal/raport/presensi/whatsapp) menemukan baris guru pemanggil lewat
-- PENCOCOKAN NAMA: teachers.full_name ilike profiles.full_name. Bila nama di
-- profil akun berbeda sedikit dari baris guru (gelar "Ustadz"/"S.Pd.I", spasi
-- ganda, nama diedit, dsb.) seluruh data guru jadi KOSONG — bug berulang yang
-- selama ini "ditambal" dengan fallback di sisi aplikasi.
--
-- Solusi permanen:
--   1. Kolom teachers.profile_id (FK ke profiles, unique) — link UUID.
--   2. Backfill idempoten: login_username ↔ profiles.username dulu, lalu nama
--      persis, lalu nama ternormalisasi (tanpa titel/spasi).
--   3. Trigger sinkronisasi nama: mengubah nama di profil guru otomatis
--      mengubah baris guru (dan sebaliknya) — modul lama yang masih mencocokkan
--      nama selalu berhasil, data tidak pernah "hilang" lagi.
--   4. Fungsi public.current_teacher_id() — resolusi UUID tunggal untuk RPC.
--   5. halaqah_current_teacher() & teacher_students_list() pakai UUID dulu,
--      fallback nama lama tetap ada (kompatibel data lama).
-- Idempoten: aman dijalankan ulang; tidak ada data yang dihapus/diubah selain
-- mengisi profile_id yang masih kosong.
-- ============================================================================

-- 1. Kolom + index -----------------------------------------------------------
alter table public.teachers add column if not exists profile_id uuid
  references public.profiles (id) on delete set null;
create unique index if not exists teachers_profile_id_key
  on public.teachers (profile_id) where profile_id is not null;
create index if not exists teachers_profile_id_idx on public.teachers (profile_id);

-- 2. Backfill idempoten (hanya baris yang profile_id-nya masih kosong) -------
--    Prioritas: (a) username akun = login_username guru; (b) nama persis;
--    (c) nama ternormalisasi (huruf kecil, tanpa titel/tanda baca/spasi).
create or replace function public.tahfizh_backfill_teacher_profile_ids()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked integer := 0;
  v_t record;
  v_pid uuid;
begin
  -- (a) via username akun (paling andal)
  update public.teachers t
  set profile_id = p.id
  from public.profiles p
  where t.profile_id is null
    and p.role = 'USTADZ'
    and t.tenant_id = p.tenant_id
    and t.login_username is not null
    and p.username is not null
    and lower(btrim(t.login_username)) = lower(btrim(p.username));
  get diagnostics v_linked = row_count;

  -- (b) nama persis dalam tenant (satu kandidat saja)
  for v_t in
    select t.id, t.tenant_id, t.full_name
    from public.teachers t
    where t.profile_id is null
  loop
    select p.id into v_pid
    from public.profiles p
    where p.role = 'USTADZ'
      and p.tenant_id = v_t.tenant_id
      and lower(btrim(p.full_name)) = lower(btrim(v_t.full_name))
    order by p.created_at
    limit 1;
    if v_pid is not null then
      update public.teachers set profile_id = v_pid where id = v_t.id;
      v_linked := v_linked + 1;
    else
      -- (c) nama ternormalisasi (strip titel & tanda baca)
      select p.id into v_pid
      from public.profiles p
      where p.role = 'USTADZ'
        and p.tenant_id = v_t.tenant_id
        and regexp_replace(
              lower(btrim(p.full_name)),
              '\y(ust|ustadz|ustadzah|h|haji|hajah|dr|kh|ki|s\.pd\.i?|m\.pd)\y',
              '', 'g'
            ) = regexp_replace(
              lower(btrim(v_t.full_name)),
              '\y(ust|ustadz|ustadzah|h|haji|hajah|dr|kh|ki|s\.pd\.i?|m\.pd)\y',
              '', 'g'
            )
        and regexp_replace(lower(btrim(p.full_name)), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(btrim(v_t.full_name)), '[^a-z0-9]', '', 'g')
      order by p.created_at
      limit 1;
      if v_pid is not null then
        update public.teachers set profile_id = v_pid where id = v_t.id;
        v_linked := v_linked + 1;
      end if;
    end if;
  end loop;

  return v_linked;
end;
$$;

select public.tahfizh_backfill_teacher_profile_ids();

-- 3. Trigger sinkronisasi nama profil ↔ guru (dua arah, rekursi aman) --------
--    Nama diubah di profil → baris guru ikut; diubah di guru → profil ikut.
--    Kedua arah memakai SATU fungsi dengan guard session variable agar tidak
--    saling memanggil tanpa henti.
create or replace function public.tahfizh_sync_teacher_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_full_name text;
begin
  if coalesce(current_setting('app.syncing_teacher_name', true), '') = 'on' then
    return null;
  end if;

  if TG_TABLE_NAME = 'teachers' then
    -- Guru diubah → sinkron ke profil akunnya (bila sudah ter-link).
    if new.profile_id is not null and new.full_name is distinct from old.full_name then
      perform set_config('app.syncing_teacher_name', 'on', true);
      update public.profiles set full_name = new.full_name where id = new.profile_id;
      perform set_config('app.syncing_teacher_name', 'off', true);
    end if;
    return new;
  end if;

  -- Profil diubah → sinkron ke baris guru ter-link.
  if new.full_name is distinct from old.full_name then
    select t.id, t.tenant_id into v_tenant, v_full_name
    from public.teachers t where t.profile_id = new.id;
    if v_tenant is not null then
      perform set_config('app.syncing_teacher_name', 'on', true);
      update public.teachers set full_name = new.full_name where profile_id = new.id;
      perform set_config('app.syncing_teacher_name', 'off', true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tahfizh_teacher_name_sync on public.teachers;
create trigger tahfizh_teacher_name_sync
  after update of full_name on public.teachers
  for each row execute function public.tahfizh_sync_teacher_profile_name();

drop trigger if exists tahfizh_profile_name_sync on public.profiles;
create trigger tahfizh_profile_name_sync
  after update of full_name on public.profiles
  for each row execute function public.tahfizh_sync_teacher_profile_name();

-- 4. Fungsi resolusi guru UUID tunggal (dipakai RPC baru) --------------------
create or replace function public.current_teacher_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then return null; end if;
  select tenant_id into v_tenant from public.profiles where id = v_uid;
  if v_tenant is null then return null; end if;

  -- Utama: link UUID profil → guru.
  return (select t.id from public.teachers t
          where t.tenant_id = v_tenant and t.profile_id = v_uid
          order by t.created_at desc limit 1);
end;
$$;

grant execute on function public.current_teacher_id() to authenticated;

-- 5. halaqah_current_teacher() — UUID dulu, nama sebagai fallback ------------
create or replace function public.halaqah_current_teacher()
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_teacher uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.tenant_id is null then return null; end if;

  -- V12.11: utama = link UUID (akurat walau nama profil ≠ nama guru).
  v_teacher := public.current_teacher_id();
  if v_teacher is not null then
    return (select t.id from public.teachers t
            where t.id = v_teacher and t.tenant_id = v_profile.tenant_id
              and t.status = 'ACTIVE');
  end if;

  -- Fallback lama (data yang belum ter-backfill): pencocokan nama.
  return (select t.id from public.teachers t
          where t.tenant_id = v_profile.tenant_id and t.full_name ilike v_profile.full_name
          order by t.created_at desc limit 1);
end;
$$;

-- 6. teacher_students_list() — UUID dulu, nama sebagai fallback --------------
drop function if exists public.teacher_students_list();

create or replace function public.teacher_students_list()
returns table (
  id                uuid,
  business_code     text,
  nis               text,
  nisn              text,
  full_name         text,
  nickname          text,
  gender            public.gender_type,
  status            public.entity_status,
  guardian_name     text,
  guardian_whatsapp text,
  halaqah_id        uuid,
  halaqah_name      text
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

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V12.11: guru di-resolve via link UUID profil (akurat walau nama beda);
  -- bila belum ter-link, fallback pencocokan nama (data lama).
  v_teacher := public.current_teacher_id();
  if v_teacher is null and v_role = 'USTADZ' then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
  end if;

  if v_role = 'USTADZ' then
    if v_teacher is null then
      return;
    end if;

    return query
      select s.id, s.business_code, s.nis, s.nisn, s.full_name, s.nickname,
             s.gender, s.status, s.guardian_name, s.guardian_whatsapp,
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
        and exists (
          select 1 from public.halaqah_teachers ht
          join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
          where ht.teacher_id = v_teacher and h1.student_id = s.id
        )
      order by s.business_code;
  else
    -- KOORDINATOR/ADMIN: seluruh santri lembaga.
    return query
      select s.id, s.business_code, s.nis, s.nisn, s.full_name, s.nickname,
             s.gender, s.status, s.guardian_name, s.guardian_whatsapp,
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
  end if;
end;
$$;

grant execute on function public.teacher_students_list() to authenticated;

-- 7. RPC grid V12.8/V12.6 — resolusi guru via UUID (fallback nama) -----------
--    learning_grid / learning_save_grid / tahfidz_surahs_grid /
--    tahfidz_save_grid: blok pencocokan nama diganti current_teacher_id()
--    + fallback nama bila belum ter-link.

create or replace function public.learning_grid(p_module text)
returns jsonb
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
  v_materials jsonb;
  v_students  jsonb;
  v_cells     jsonb;
  v_stable    text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_module not in ('HADITS', 'DOA') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;

  -- V12.11: UUID dulu (link profil), fallback nama lama.
  if v_role = 'USTADZ' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      select t.id into v_teacher
      from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc
      limit 1;
    end if;
    if v_teacher is null then
      return jsonb_build_object('materials', '[]'::jsonb, 'students', '[]'::jsonb, 'cells', '[]'::jsonb);
    end if;
  end if;

  v_stable := case p_module when 'HADITS' then 'hadith_materials' else 'daily_prayer_materials' end;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''materialId'', m.id, ''title'', m.title, ''sortOrder'', m.sort_order) order by m.sort_order), ''[]''::jsonb)
     from public.%I m
     where m.tenant_id = $1 and m.is_active',
    v_stable
  )
  using v_tenant
  into v_materials;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name, 'nickname', s.nickname) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
      where ht.teacher_id = v_teacher and h1.student_id = s.id
    ));

  with latest as (
    select distinct on (a.student_id, coalesce(a.hadith_id, a.prayer_id, a.tajwid_id))
      a.student_id,
      coalesce(a.hadith_id, a.prayer_id, a.tajwid_id) as material_id,
      a.status,
      a.score_label,
      a.score_value
    from public.learning_assessments a
    where a.tenant_id = v_tenant
      and a.module_type = p_module::public.learning_module
      and a.deleted_at is null
      and a.student_id in (select (x->>'id')::uuid from jsonb_array_elements(v_students) x)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'materialId', l.material_id,
           'studentId', l.student_id,
           'status', l.status,
           'scoreLabel', l.score_label,
           'scoreValue', l.score_value
         )), '[]'::jsonb)
  into v_cells
  from latest l;

  return jsonb_build_object('materials', v_materials, 'students', v_students, 'cells', v_cells);
end;
$$;

grant execute on function public.learning_grid(text) to authenticated;

create or replace function public.learning_save_grid(p_module text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_tenant    uuid;
  v_role      text;
  v_teacher   uuid;
  v_item      jsonb;
  v_material  uuid;
  v_student   uuid;
  v_mode      public.tahfidz_mode;
  v_status    text;
  v_score     integer;
  v_label     text;
  v_saved     integer := 0;
  v_deleted   integer := 0;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;
  if p_module not in ('HADITS', 'DOA') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 2000 then
    raise exception 'BATCH_TIDAK_VALID';
  end if;

  -- V12.11: UUID dulu, fallback nama (sama dengan learning_grid).
  if v_role = 'USTADZ' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      select t.id into v_teacher
      from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc
      limit 1;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_material := nullif(v_item->>'materialId', '')::uuid;
    v_student  := nullif(v_item->>'studentId', '')::uuid;
    v_status   := coalesce(v_item->>'status', 'DINILAI');
    v_mode     := coalesce(nullif(v_item->>'mode', ''),
                           (select coalesce(mode, 'CENTANG') from public.tahfidz_settings where tenant_id = v_tenant))::public.tahfidz_mode;
    v_score    := nullif(v_item->>'scoreValue', '')::integer;
    v_label    := nullif(v_item->>'scoreLabel', '');

    if v_material is null or v_student is null then
      raise exception 'BATCH_TIDAK_VALID';
    end if;

    if not exists (
      select 1 from public.students s
      where s.id = v_student and s.tenant_id = v_tenant and s.status = 'ACTIVE'
    ) then
      raise exception 'SANTRI_TIDAK_DITEMUKAN';
    end if;
    if v_role = 'USTADZ' and not exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs
        on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher and hs.student_id = v_student
    ) then
      raise exception 'SANTRI_BUKAN_BINAAN';
    end if;

    if v_status = 'BELUM' then
      update public.learning_assessments a
      set deleted_at = now(), deleted_by = v_uid
      where a.tenant_id = v_tenant
        and a.student_id = v_student
        and a.assessed_date = current_date
        and a.deleted_at is null
        and a.created_by = v_uid
        and coalesce(a.hadith_id, a.prayer_id, a.tajwid_id) = v_material
        and a.module_type = p_module::public.learning_module;
      get diagnostics v_deleted = row_count;
      v_saved := v_saved + v_deleted;
    else
      if v_status not in ('DINILAI', 'DIPELAJARI') then
        raise exception 'STATUS_TIDAK_VALID';
      end if;

      if v_mode = 'CENTANG' then
        v_score := null;
        v_label := null;
      elsif v_mode = 'ANGKA' then
        if v_score is null or v_score < 1 or v_score > 100 then
          raise exception 'NILAI_ANGKA_TIDAK_VALID';
        end if;
        v_label := null;
      else -- HURUF
        if v_label is null or not exists (
          select 1 from public.tahfidz_grade_settings g
          where g.tenant_id = v_tenant and g.label = v_label
        ) then
          raise exception 'GRADE_TIDAK_VALID';
        end if;
        v_score := null;
      end if;

      perform public.learning_save_assessment(
        v_student, p_module, v_material, current_date,
        case when v_status = 'DINILAI' then 'LULUS' else 'BELUM_SELESAI' end,
        v_score, v_label, null, '{}'::jsonb, null, v_mode::text
      );
      v_saved := v_saved + 1;
    end if;
  end loop;

  return v_saved;
end;
$$;

grant execute on function public.learning_save_grid(text, jsonb) to authenticated;
