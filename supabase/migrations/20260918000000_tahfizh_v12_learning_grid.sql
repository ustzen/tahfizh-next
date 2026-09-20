-- ============================================================================
-- TAHFIZH V12.8 — Grid Penilaian Hadits & Doa Harian (materi × santri)
-- ============================================================================
-- Permintaan (V12.8):
--   1. Menu Hadits & Doa Harian memakai GRID seperti menu Tahfidz: BARIS ATAS
--      (header kolom) = materi/hadits/doa lembaga, BARIS KIRI = nama anak,
--      sel = nilai (centang / huruf / angka) — muat satu halaman.
--
-- RPC baru (idempoten, pola tahfidz_surahs_grid / tahfidz_save_grid V12.6):
--   learning_grid(p_module)               — materi aktif modul + santri + nilai
--   learning_save_grid(p_module, p_items) — simpan massal (insert riwayat baru,
--       bukan overwrite) lewat learning_save_assessment (verifikasi session →
--       role → binaan halaqah → materi aktif → status/nilai per mode; trigger
--       learning_record_history otomatis menulis histori append-only).
--   MENONAKTIFKAN nilai (status BELUM) = soft delete penilaian hari ini milik
--       penilai untuk materi tsb (riwayat tetap utuh).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC learning_grid — sumber grid guru/koordinator hadits & doa
-- ---------------------------------------------------------------------------
drop function if exists public.learning_grid(text);

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

  -- USTADZ: guru = baris teachers lembaga yang cocok dengan nama profil
  -- (pola tahfidz_surahs_grid). KOORDINATOR/ADMIN melihat seluruh santri.
  if v_role = 'USTADZ' then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
    if v_teacher is null then
      return jsonb_build_object('materials', '[]'::jsonb, 'students', '[]'::jsonb, 'cells', '[]'::jsonb);
    end if;
  end if;

  -- Tabel materi sesuai modul.
  v_stable := case p_module when 'HADITS' then 'hadith_materials' else 'daily_prayer_materials' end;

  -- Header kolom = materi aktif lembaga (urut sort_order, sama seperti daftar).
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''materialId'', m.id, ''title'', m.title, ''sortOrder'', m.sort_order) order by m.sort_order), ''[]''::jsonb)
     from public.%I m
     where m.tenant_id = $1 and m.is_active',
    v_stable
  )
  using v_tenant
  into v_materials;

  -- Baris kiri = santri (binaan guru via halaqah yang diampu; seluruh santri
  -- aktif lembaga untuk KOORDINATOR/ADMIN), diurut nama — pola tahfidz_surahs_grid.
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

  -- Sel = penilaian TERAKHIR per (santri, materi) modul ini (soft delete
  -- diabaikan). Read langsung dari learning_assessments (nilai tersimpan).
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

-- ---------------------------------------------------------------------------
-- 2. RPC learning_save_grid — simpan massal penilaian grid hadits & doa
--    POLA: setiap perubahan = riwayat BARU (insert), bukan overwrite — konsisten
--    dengan form detail (learning_save_assessment) dan histori append-only.
-- ---------------------------------------------------------------------------
drop function if exists public.learning_save_grid(text, jsonb);

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

    -- Santri wajib satu tenant (dan binaan guru untuk USTADZ — pola V12.7).
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
      where ht.teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = v_tenant
          and full_name ilike (select full_name from public.profiles where id = v_uid)
        order by t.created_at desc limit 1
      ) and hs.student_id = v_student
    ) then
      raise exception 'SANTRI_BUKAN_BINAAN';
    end if;

    if v_status = 'BELUM' then
      -- MENONAKTIFKAN nilai pada grid: soft delete penilaian HARI INI milik
      -- penilai ini untuk materi tsb (riwayat & kartu prestasi tetap utuh).
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
      -- DINILAI / DIPELAJARI → validasi + insert lewat RPC v2 (status/nilai
      -- per mode, notes kosong, binaan & materi aktif diverifikasi di dalam).
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

      -- Mapping status grid → status modul:
      --   DINILAI    → LULUS  (hafal/lulus — default grid, seperti centang)
      --   DIPELAJARI → BELUM_SELESAI (sedang dipelajari)
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
