-- ============================================================================
-- TAHFIZH V12.6 — Grid Penilaian Tahfidz Guru + Sinkron Dasbor Santri
-- ============================================================================
-- 1. RPC tahfidz_surahs_grid()
--    Sumber menu Tahfidz guru: baris = surat aktif lembaga BERURUT An-Nas →
--    An-Naba' (sort_order seed V3), kolom = santri binaan guru (anggota halaqah
--    yang diampu, nama + panggilan), sel = nilai tersimpan per (surat, santri).
--    Kolom santri diurut alfabetis (KOL_n sesuai urutan nama).
--
-- 2. RPC tahfidz_save_grid(p_items)
--    Simpan massal penilaian guru. Memakai ulang seluruh verifikasi
--    tahfidz_save_assessment (session → role USTADZ → tenant → guru → binaan →
--    surat aktif → validasi nilai per mode). PENAMBAHAN V12.6: p_mode opsional
--    pada tiap item — guru memilih mode per penilaian (CENTANG/HURUF/ANGKA)
--    tanpa mengubah setting lembaga. Nilai HURUF divalidasi terhadap
--    tahfidz_grade_settings lembaga; CENTANG menyimpan label "✓".
--
-- 3. RPC tahfidz_santri_grid()
--    Sumber blok "Hafalan Tahfidz" di dasbor santri (WALI_SANTRI): baris = surat
--    aktif, kolom = anak yang terhubung akun (guardian_students), sel = nilai.
--    SINKRON: membaca tabel tahfidz_assessments yang sama dengan data guru.
--
-- 4. Backfill surah lembaga LAMA: tenant yang dibuat sebelum seed ini
--    (tanpa baris tahfidz_tenant_surahs) tetap mendapat 37 surat aktif —
--    idempoten (WHERE NOT EXISTS), data yang sudah dikonfigurasi tidak disentuh.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill surah untuk SEMUA tenant yang belum punya konfigurasi surah
-- ---------------------------------------------------------------------------
insert into public.tahfidz_tenant_surahs (tenant_id, surah_id, sort_order, is_active)
select t.id, s.id, s.sort_order, true
from public.tenants t
join public.tahfidz_surahs s on true
where not exists (
  select 1 from public.tahfidz_tenant_surahs ts where ts.tenant_id = t.id
);

-- ---------------------------------------------------------------------------
-- 2. RPC tahfidz_surahs_grid — grid penilaian guru (surat × santri binaan)
-- ---------------------------------------------------------------------------
drop function if exists public.tahfidz_surahs_grid();

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

  -- Guru = baris teachers lembaga yang cocok dengan nama profil (pola modul
  -- lain). ADMIN/KOORDINATOR melihat seluruh santri lembaga.
  if v_role = 'USTADZ' then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
    if v_teacher is null then
      return jsonb_build_object('students', '[]'::jsonb, 'rows', '[]'::jsonb);
    end if;
  end if;

  -- Kolom = santri (binaan guru via halaqah yang diampu / seluruh santri
  -- lembaga untuk ADMIN & KOORDINATOR), diurut nama.
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

  -- Baris = surat aktif lembaga (An-Nas → An-Naba' mengikuti sort_order seed).
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
-- 2b. RPC tahfidz_grid_cells — nilai tersimpan per (surat, santri binaan)
--     untuk mengisi sel grid guru (pemetaan key "surahId:studentId").
-- ---------------------------------------------------------------------------
drop function if exists public.tahfidz_grid_cells();

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
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant::uuid
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
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
-- 3. RPC tahfidz_save_grid — simpan massal (verifikasi identik satu-per-satu)
-- ---------------------------------------------------------------------------
drop function if exists public.tahfidz_save_grid(jsonb);

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

  select t.id into v_teacher
  from public.teachers t
  where t.tenant_id = v_tenant::uuid
    and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
  order by t.created_at desc
  limit 1;
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

    -- Santri harus satu tenant + binaan guru (halaqah yang diampu).
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

    -- Surat aktif milik lembaga.
    select ts.is_active into v_active
    from public.tahfidz_tenant_surahs ts
    where ts.id = v_tsurah and ts.tenant_id = v_tenant::uuid;
    if v_active is null then
      raise exception 'SURAT_TIDAK_AKTIF';
    end if;
    if v_active = false then
      raise exception 'SURAT_TIDAK_AKTIF';
    end if;

    -- Validasi nilai sesuai mode penilaian yang dipilih guru.
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

    -- Upsert current state (trigger V3 menulis histori append-only; kolom
    -- mode_at_entry_cache mencatat mode yang menghasilkan nilai ini).
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

-- ---------------------------------------------------------------------------
-- 4. RPC tahfidz_santri_grid — blok Hafalan Tahfidz dasbor santri
--    (SINKRON dengan data guru: sumber tabel tahfidz_assessments yang sama)
-- ---------------------------------------------------------------------------
drop function if exists public.tahfidz_santri_grid();

create or replace function public.tahfidz_santri_grid()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_children jsonb;
  v_rows     jsonb;
  v_surahs   jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'WALI_SANTRI' then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Kolom = anak yang terhubung akun ini (guardian_students).
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_children
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  join public.students s on s.id = gs.student_id
  where g.profile_id = v_uid and s.tenant_id = v_tenant::uuid;

  -- Surat aktif lembaga (baris, An-Nas → An-Naba').
  select coalesce(jsonb_agg(jsonb_build_object(
           'surahId', ts.id,
           'name', coalesce(ts.name_override, m.name),
           'sortOrder', ts.sort_order
         ) order by ts.sort_order), '[]'::jsonb)
  into v_surahs
  from public.tahfidz_tenant_surahs ts
  left join public.tahfidz_surahs m on m.id = ts.surah_id
  where ts.tenant_id = v_tenant::uuid and ts.is_active = true;

  -- Sel nilai (hanya yang sudah ada penilaiannya).
  select coalesce(jsonb_agg(jsonb_build_object(
           'surahId', a.tenant_surah_id,
           'studentId', a.student_id,
           'status', a.status,
           'scoreLabel', a.score_label,
           'scoreValue', a.score_value
         )), '[]'::jsonb)
  into v_rows
  from public.tahfidz_assessments a
  join public.guardian_students gs on gs.student_id = a.student_id
  join public.guardians g on g.id = gs.guardian_id
  where g.profile_id = v_uid
    and a.tenant_id = v_tenant::uuid
    and a.status in ('DIPELAJARI', 'DINILAI');

  return jsonb_build_object('children', v_children, 'surahs', v_surahs, 'cells', v_rows);
end;
$$;

grant execute on function public.tahfidz_santri_grid() to authenticated;
