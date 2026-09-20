-- ============================================================================
-- TAHFIZH V12.9 — Tampilan grid Tahfidz gaya "No | Nama | Kelas | Jml" +
-- nama surat vertikal di header (semua surat cukup dalam satu halaman).
-- ============================================================================
-- Permintaan (V12.9):
--   1. Baris kiri diperkaya: No urut, Nama santri, KELAS (halaqah aktif
--      santri), dan Jml (jumlah surat yang sudah DINILAI).
--   2. Header kolom surat ditulis vertikal (writing-mode: vertical-rl) sehingga
--      seluruh 37 surat (An-Nas → An-Naba') muat satu halaman tanpa scroll
--      horizontal.
--
-- Perubahan SQL (idempoten — drop+create ulang RPC pembaca grid):
--   * tahfidz_surahs_grid  → students kini menyertakan `kelas` (nama halaqah
--     aktif via halaqah_teachers × halaqah_students; bisa NULL bila santri
--     belum punya halaqah) — paritas pencarian guru dengan V12.6.
--   * tahfidz_grid_cells   → nilai tersimpan (status DIPELAJARI/DINILAI).
--   * tahfidz_santri_grid  → dasbor wali juga membawa `kelas` per anak.
-- Tidak ada perubahan tabel/RLS; hanya definisi fungsi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RPC tahfidz_surahs_grid — grid penilaian guru (surat × santri + kelas)
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
  -- lembaga untuk ADMIN & KOORDINATOR), diurut nama. `kelas` = nama halaqah
  -- aktif santri (NULL bila belum tergabung halaqah).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.full_name,
           'nickname', s.nickname,
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
-- RPC tahfidz_grid_cells — nilai tersimpan per (surat, santri binaan)
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
-- RPC tahfidz_santri_grid — blok Hafalan Tahfidz dasbor wali (dengan kelas)
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

  -- Kolom = anak yang terhubung akun ini (guardian_students), + kelas aktif.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.full_name,
           'kelas', h.name
         ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_children
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  join public.students s on s.id = gs.student_id
  left join lateral (
    select hq.name
    from public.halaqah_students hs
    join public.halaqahs hq on hq.id = hs.halaqah_id
    where hs.student_id = s.id
      and hs.left_at is null
    order by hs.joined_at desc
    limit 1
  ) h on true
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
