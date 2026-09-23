-- ============================================================================
-- TAHFIZH V33 — PERBAIKAN: menu Tahfidz "Penilaian belum berhasil disimpan"
-- ============================================================================
-- Akar masalah: tahfidz_surahs_grid() / tahfidz_grid_cells() / tahfidz_save_grid()
-- (V12.6, migrasi 20260915220000) masih memakai PENCOCOKAN NAMA murni untuk
-- menemukan baris guru pemanggil:
--
--   where t.tenant_id = v_tenant
--     and lower(btrim(t.full_name)) = lower(btrim(<nama profil akun>))
--
-- Migrasi V12.11 (20260918020000) memperkenalkan public.current_teacher_id()
-- (link UUID teachers.profile_id → profiles.id, jauh lebih andal) dan
-- KOMENTARNYA sendiri menyatakan tahfidz_surahs_grid / tahfidz_save_grid ikut
-- diperbaiki — tapi CREATE OR REPLACE untuk ketiga fungsi tahfidz di atas
-- TIDAK PERNAH ditulis (hanya learning_grid/learning_save_grid yang benar-benar
-- diganti). Akibatnya: begitu nama di profil akun guru berbeda sedikit dari
-- teachers.full_name (gelar, spasi, nama diedit setelah akun dibuat, dsb.),
-- v_teacher = null → RPC melempar GURU_TIDAK_DITEMUKAN. Error ini tidak ada
-- di peta pesan saveTahfidzGridAction, jadi guru hanya melihat pesan generik
-- "Penilaian belum berhasil disimpan. Silakan coba lagi." walau input sudah
-- benar dan koneksi baik-baik saja.
--
-- Perbaikan (idempoten, tidak mengubah data): redefinisikan ketiga fungsi
-- dengan pola V12.11 yang sama seperti learning_grid — current_teacher_id()
-- dulu, fallback pencocokan nama lama bila baris guru belum ter-link.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tahfidz_surahs_grid — grid penilaian guru (surat × santri binaan)
-- ---------------------------------------------------------------------------
create or replace function public.tahfidz_surahs_grid()
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
  v_students jsonb;
  v_rows    jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V33: link UUID dulu (akurat walau nama profil ≠ nama guru), fallback nama.
  if v_role = 'USTADZ' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      select t.id into v_teacher
      from public.teachers t
      where t.tenant_id = v_tenant::uuid
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc
      limit 1;
    end if;
    if v_teacher is null then
      return jsonb_build_object('students', '[]'::jsonb, 'rows', '[]'::jsonb);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.full_name, 'nickname', s.nickname, 'code', s.business_code
         ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant::uuid
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
      where ht.teacher_id = v_teacher and h1.student_id = s.id
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
           'surahId', ts.id,
           'name', coalesce(ts.name_override, m.name),
           'sortOrder', ts.sort_order
         ) order by ts.sort_order), '[]'::jsonb)
  into v_rows
  from public.tahfidz_tenant_surahs ts
  left join public.tahfidz_surahs m on m.id = ts.surah_id
  where ts.tenant_id = v_tenant::uuid
    and ts.is_active = true;

  return jsonb_build_object('students', v_students, 'rows', v_rows);
end;
$$;

grant execute on function public.tahfidz_surahs_grid() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. tahfidz_grid_cells — nilai tersimpan per (surat, santri binaan)
-- ---------------------------------------------------------------------------
create or replace function public.tahfidz_grid_cells()
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
  v_cells   jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      select t.id into v_teacher
      from public.teachers t
      where t.tenant_id = v_tenant::uuid
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc
      limit 1;
    end if;
    if v_teacher is null then
      return '[]'::jsonb;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'surahId', a.tenant_surah_id,
           'studentId', a.student_id,
           'status', a.status,
           'scoreLabel', a.score_label,
           'scoreValue', a.score_value
         )), '[]'::jsonb)
  into v_cells
  from public.tahfidz_assessments a
  where a.tenant_id = v_tenant::uuid
    and a.status in ('DIPELAJARI', 'DINILAI')
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
      where ht.teacher_id = v_teacher and h1.student_id = a.student_id
    ));

  return v_cells;
end;
$$;

grant execute on function public.tahfidz_grid_cells() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. tahfidz_save_grid — simpan massal penilaian guru
-- ---------------------------------------------------------------------------
create or replace function public.tahfidz_save_grid(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_item     jsonb;
  v_student  uuid;
  v_tsurah   uuid;
  v_mode     public.tahfidz_mode;
  v_status   text;
  v_score    numeric;
  v_label    text;
  v_note     text;
  v_saved    integer := 0;
  v_stenant  uuid;
  v_active   boolean;
  v_mode_db  public.tahfidz_mode;
  v_grade_ok boolean;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V33: link UUID dulu (akurat walau nama profil ≠ nama guru), fallback nama.
  v_teacher := public.current_teacher_id();
  if v_teacher is null then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
  end if;
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 2000 then
    raise exception 'BATCH_TIDAK_VALID';
  end if;

  select mode into v_mode_db from public.tahfidz_settings where tenant_id = v_tenant::uuid;
  v_mode_db := coalesce(v_mode_db, 'CENTANG');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_student := nullif(v_item->>'studentId', '')::uuid;
    v_tsurah  := nullif(v_item->>'surahId', '')::uuid;
    v_mode    := coalesce(nullif(v_item->>'mode', ''), v_mode_db)::public.tahfidz_mode;
    v_status  := coalesce(v_item->>'status', 'DINILAI');
    v_score   := nullif(v_item->>'scoreValue', '')::numeric;
    v_label   := nullif(v_item->>'scoreLabel', '');
    v_note    := left(coalesce(v_item->>'note', ''), 500);

    if v_student is null or v_tsurah is null then
      raise exception 'BATCH_TIDAK_VALID';
    end if;
    if v_status not in ('BELUM', 'DIPELAJARI', 'DINILAI') then
      raise exception 'STATUS_TIDAK_VALID';
    end if;

    select s.tenant_id into v_stenant
    from public.students s
    where s.id = v_student
      and s.status = 'ACTIVE'
      and exists (
        select 1 from public.halaqah_teachers ht
        join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
        where ht.teacher_id = v_teacher and h1.student_id = s.id
      );
    if v_stenant is null or v_stenant <> v_tenant::uuid then
      raise exception 'SANTRI_BUKAN_BINAAN';
    end if;

    select ts.is_active into v_active
    from public.tahfidz_tenant_surahs ts
    where ts.id = v_tsurah and ts.tenant_id = v_tenant::uuid;
    if v_active is null then
      raise exception 'SURAT_TIDAK_AKTIF';
    end if;
    if v_active = false then
      raise exception 'SURAT_TIDAK_AKTIF';
    end if;

    if v_status = 'DINILAI' then
      if v_mode = 'CENTANG' then
        v_score := null;
        v_label := '✓';
      elsif v_mode = 'ANGKA' then
        if v_score is null or v_score < 1 or v_score > 100 or v_score <> floor(v_score) then
          raise exception 'NILAI_ANGKA_TIDAK_VALID';
        end if;
        v_label := null;
      else -- HURUF: wajib grade lembaga
        if v_label is null then
          raise exception 'GRADE_TIDAK_VALID';
        end if;
        select count(*) > 0 into v_grade_ok
        from public.tahfidz_grade_settings g
        where g.tenant_id = v_tenant::uuid and g.label = v_label;
        if not v_grade_ok then
          raise exception 'GRADE_TIDAK_VALID';
        end if;
        v_score := null;
      end if;
    else
      v_score := null;
      v_label := null;
    end if;

    insert into public.tahfidz_assessments
      (tenant_id, student_id, tenant_surah_id, teacher_id, assessed_by,
       status, score_value, score_label, note, mode_at_entry_cache)
    values
      (v_tenant::uuid, v_student, v_tsurah, v_teacher, v_uid,
       v_status::public.tahfidz_progress, v_score::int, v_label, nullif(v_note, ''), v_mode)
    on conflict (student_id, tenant_surah_id) do update
      set status            = excluded.status,
          score_value       = excluded.score_value,
          score_label       = excluded.score_label,
          note              = excluded.note,
          teacher_id        = excluded.teacher_id,
          assessed_by       = excluded.assessed_by,
          assessed_at       = now(),
          mode_at_entry_cache = excluded.mode_at_entry_cache,
          updated_at        = now();

    v_saved := v_saved + 1;
  end loop;

  return v_saved;
end;
$$;

grant execute on function public.tahfidz_save_grid(jsonb) to authenticated;
