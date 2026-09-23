-- ============================================================================
-- TAHFIZH V28 — TAMPILAN RAPAT + URUTAN NIS
-- ============================================================================
-- 1. Presensi guru: daftar santri per halaqah diurut berdasarkan NIS
--    (business_code), bukan abjad nama. Kolom NIS ditambahkan di UI (lihat
--    perubahan attendance-sheet.tsx).
-- 2. Menu Tahfidz guru: kolom "Kelas" & "Jml" pada grid dihapus, kolom NIS
--    ditambahkan (business_code). Urutan baris = jumlah surat yang sudah
--    DINILAI (terbanyak dulu), bila sama maka NIS LEBIH BESAR tampil lebih
--    atas (dihitung & diurutkan di client agar sinkron dengan status sel
--    yang baru saja diubah guru — lihat grid-client.tsx).
-- 3. Hadits, Doa Harian, Tajwid, Tugas: daftar santri diurut berdasarkan NIS.
-- Tidak ada perubahan tabel/RLS; hanya definisi fungsi (idempoten).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. halaqah_detail — anggota halaqah (dipakai Presensi) diurut NIS.
-- ---------------------------------------------------------------------------
create or replace function public.halaqah_detail(p_halaqah_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_teacher uuid := public.halaqah_current_teacher();
  v_role text;
  v_row public.halaqahs;
begin
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_row from public.halaqahs
  where id = p_halaqah_id and tenant_id = v_tenant;
  if v_row is null then raise exception 'HALAQAH_TIDAK_DITEMUKAN'; end if;

  if v_role = 'USTADZ' and not public.halaqah_teacher_has_access(p_halaqah_id, v_teacher) then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('ADMIN', 'KOORDINATOR', 'DEVELOPER', 'USTADZ') then
    raise exception 'AKSES_DITOLAK';
  end if;

  return jsonb_build_object(
    'halaqah', to_jsonb(v_row),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.full_name, 'code', t.business_code,
        'isPrimary', ht.is_primary)
        order by ht.is_primary desc, t.full_name)
      from public.halaqah_teachers ht
      join public.teachers t on t.id = ht.teacher_id
      where ht.halaqah_id = p_halaqah_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.full_name, 'code', s.business_code, 'gender', s.gender)
        -- V28: urut NIS (bukan abjad) agar konsisten dengan daftar induk santri.
        order by s.business_code, s.full_name)
      from public.halaqah_students hs
      join public.students s on s.id = hs.student_id
      where hs.halaqah_id = p_halaqah_id and hs.left_at is null
    ), '[]'::jsonb),
    'studentCount', (select count(*) from public.halaqah_students hs
                     where hs.halaqah_id = p_halaqah_id and hs.left_at is null),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentName', s2.full_name, 'halaqahName', h2.name,
        'joinedAt', hs2.joined_at, 'leftAt', hs2.left_at)
        order by hs2.joined_at desc)
      from public.halaqah_students hs2
      join public.students s2 on s2.id = hs2.student_id
      join public.halaqahs h2 on h2.id = hs2.halaqah_id
      where hs2.student_id in (
        select student_id from public.halaqah_students where halaqah_id = p_halaqah_id
      )
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. tahfidz_surahs_grid — tambahkan `code` (NIS). `kelas` tetap dikirim
--    untuk kompatibilitas (tidak lagi dipakai di grid guru, hanya dasbor
--    santri via tahfidz_santri_grid yang terpisah).
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

  -- V28: kolom NIS ditambahkan; urutan dasar tetap nama (pengurutan akhir —
  -- jumlah hafalan lalu NIS terbesar di atas — dilakukan di client karena
  -- tergantung status sel yang sedang diedit guru).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.full_name,
           'nickname', s.nickname,
           'code', s.business_code,
           'kelas', h.name
         ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  left join lateral (
    select hq.name
    from public.halaqah_students hs
    join public.halaqahs hq on hq.id = hs.halaqah_id
    where hs.student_id = s.id
      and hs.left_at is null
    order by hs.joined_at desc
    limit 1
  ) h on true
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
-- 3. Hadits & Doa Harian (learning_grid) — tambahkan `code` (NIS), urut NIS.
-- ---------------------------------------------------------------------------
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

  -- V28: kolom NIS + urut NIS (bukan abjad).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.full_name, 'nickname', s.nickname, 'code', s.business_code
         ) order by s.business_code, s.full_name), '[]'::jsonb)
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
    order by a.student_id, coalesce(a.hadith_id, a.prayer_id, a.tajwid_id), a.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'materialId', l.material_id, 'studentId', l.student_id,
           'status', l.status, 'scoreLabel', l.score_label, 'scoreValue', l.score_value
         )), '[]'::jsonb)
  into v_cells
  from latest l;

  return jsonb_build_object('materials', v_materials, 'students', v_students, 'cells', v_cells);
end;
$$;

grant execute on function public.learning_grid(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tajwid (tajwid_materi_grid) — tambahkan `code` (NIS), urut NIS.
-- ---------------------------------------------------------------------------
create or replace function public.tajwid_materi_grid()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_materi   jsonb;
  v_students jsonb;
  v_scores   jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.tajwid_teacher_for_session();
    if v_teacher is null then
      return jsonb_build_object('materi', '[]'::jsonb, 'students', '[]'::jsonb, 'scores', '[]'::jsonb);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'title', m.title,
           'description', m.description
         ) order by m.created_at desc, m.id), '[]'::jsonb)
  into v_materi
  from public.tajwid_materi m
  where m.tenant_id = v_tenant::uuid
    and m.deleted_at is null;

  -- V28: kolom NIS + urut NIS (bukan abjad).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.full_name,
      'nickname', s.nickname,
      'code', s.business_code
    ) order by s.business_code, s.full_name), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant::uuid
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher and hs.student_id = s.id
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
           'materiId', sc.materi_id,
           'studentId', sc.student_id,
           'mode', sc.mode,
           'scoreValue', sc.score_value,
           'scoreLabel', sc.score_label
         )), '[]'::jsonb)
  into v_scores
  from public.tajwid_materi_scores sc
  join public.tajwid_materi m on m.id = sc.materi_id
  where sc.tenant_id = v_tenant::uuid
    and m.deleted_at is null
    and (v_role <> 'USTADZ' or sc.student_id in (
      select hs.student_id
      from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher
    ));

  return jsonb_build_object('materi', v_materi, 'students', v_students, 'scores', v_scores);
end;
$$;

grant execute on function public.tajwid_materi_grid() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tugas (tugas_halaqah_grid) — tambahkan `code` (NIS), urut NIS.
-- ---------------------------------------------------------------------------
create or replace function public.tugas_halaqah_grid()
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
  v_halaqah jsonb;
  v_tasks   jsonb;
  v_students jsonb;
  v_scores  jsonb;
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
    v_teacher := public.tugas_teacher_for_session();
    if v_teacher is null then
      return jsonb_build_object('halaqah', '[]'::jsonb, 'tasks', '[]'::jsonb, 'students', '[]'::jsonb, 'scores', '[]'::jsonb);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.name), '[]'::jsonb)
  into v_halaqah
  from public.halaqahs h
  where h.tenant_id = v_tenant::uuid
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      where ht.halaqah_id = h.id and ht.teacher_id = v_teacher
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', th.id,
           'title', th.title,
           'description', th.description,
           'halaqahId', th.halaqah_id,
           'halaqahName', h.name,
           'assignedDate', th.assigned_date,
           'dueDate', th.due_date
         ) order by th.assigned_date desc, th.created_at desc), '[]'::jsonb)
  into v_tasks
  from public.tugas_halaqah th
  join public.halaqahs h on h.id = th.halaqah_id
  where th.tenant_id = v_tenant::uuid
    and th.deleted_at is null
    and (v_role <> 'USTADZ' or th.halaqah_id in (
      select ht.halaqah_id from public.halaqah_teachers ht where ht.teacher_id = v_teacher
    ));

  -- V28: kolom NIS + urut NIS (bukan abjad).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.full_name,
      'nickname', s.nickname,
      'code', s.business_code,
      'halaqahIds', coalesce((
        select jsonb_agg(hs.halaqah_id::text order by hs.halaqah_id)
        from public.halaqah_students hs
        where hs.student_id = s.id and hs.left_at is null
      ), '[]'::jsonb)
    ) order by s.business_code, s.full_name), '[]'::jsonb)
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
           'tugasId', sc.tugas_id,
           'studentId', sc.student_id,
           'mode', sc.mode,
           'scoreValue', sc.score_value,
           'scoreLabel', sc.score_label,
           'note', sc.note
         )), '[]'::jsonb)
  into v_scores
  from public.tugas_halaqah_scores sc
  join public.tugas_halaqah th on th.id = sc.tugas_id
  where sc.tenant_id = v_tenant::uuid
    and th.deleted_at is null
    and (v_role <> 'USTADZ' or th.halaqah_id in (
      select ht.halaqah_id from public.halaqah_teachers ht where ht.teacher_id = v_teacher
    ));

  return jsonb_build_object(
    'halaqah', v_halaqah,
    'tasks', v_tasks,
    'students', v_students,
    'scores', v_scores
  );
end;
$$;

grant execute on function public.tugas_halaqah_grid() to authenticated;
