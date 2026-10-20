-- ============================================================================
-- TAHFIZH V68 — TANGGAL PENILAIAN pada INPUT NILAI TARTIL MASSAL (V67)
-- ============================================================================
-- Kebutuhan: saat guru memindahkan catatan kertas lama secara massal, tanggal
-- penilaian yang tercatat harus tanggal di kertas — bukan hari input.
--
-- Cara kerja:
--   1. `tartil_save_assessment` kini membaca override `app.tartil_assessed_at`
--      (GUC lokal transaksi). Tanpa override → perilaku lama `now()` —
--      penilaian tunggal & seluruh alur lama tidak berubah sama sekali.
--      GUC tidak bisa di-set dari klien (PostgREST), hanya fungsi kita.
--   2. `tartil_save_assessments_bulk` menerima `p_assessed_at` opsional:
--      tampilkan 'TANGGAL_MASSAL_TIDAK_VALID' bila tanggal di masa depan,
--      lalu set GUC lokal-transaksi sebelum loop — sehingga SEMUA baris batch
--      memakai tanggal itu dan trigger history (AFTER INSERT) tetap snapshot
--      SATU baris CREATE dengan tanggal yang benar.
--
-- Idempoten: drop/create ulang (aman rerun).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — file ini HANYA bisa dijalankan setelah migrasi V1..V67
--    bertahan di database yang sama (CREATE FUNCTION menyelesaikan tipe yang
--    dideklarasikan saat pembuatan; tanpa tabel dasar → 42704 yang membingungkan).
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.teachers') is null
     or to_regclass('public.students') is null
     or to_regclass('public.tartil_assessments') is null then
    raise exception using message = format(
      'SKEMA_BELUM_LENGKAP: tabel dasar migrasi awal tidak ditemukan (profiles=%s, teachers=%s, students=%s, tartil_assessments=%s). Jalankan seluruh migrasi supabase/migrations/ berurutan sesuai nama file (V1..V67) dulu — paling mudah \"supabase db push\" dari project root — sebelum migrasi V68.',
      coalesce((select relname from pg_class where oid = to_regclass('public.profiles')), 'TIDAK ADA'),
      coalesce((select relname from pg_class where oid = to_regclass('public.teachers')), 'TIDAK ADA'),
      coalesce((select relname from pg_class where oid = to_regclass('public.students')), 'TIDAK ADA'),
      coalesce((select relname from pg_class where oid = to_regclass('public.tartil_assessments')), 'TIDAK ADA')
    );
  end if;
end
$preflight$;

-- -----------------------------------------------------------------------------
-- 1. tartil_save_assessment — body sama dengan V12, hanya baris assessed_at
--    yang kini fallback-aware: coalesce(GUC, now()).
-- -----------------------------------------------------------------------------
create or replace function public.tartil_save_assessment(
  p_student_id  uuid,
  p_material_id uuid,
  p_pages_label text default null,
  p_status      text default 'DINILAI',
  p_score_value integer default null,
  p_score_label text default null,
  p_free_note   text default null,
  p_notes       jsonb default '{}'::jsonb,
  p_assessment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_teacher  public.teachers;
  v_mode     public.tahfidz_mode;
  v_student  public.students;
  v_material public.tartil_materials;
  v_status   public.tahfidz_progress;
  v_id       uuid;
  v_key      text;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V12.14: guru via link UUID profil (akurat walau nama beda); fallback nama.
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id and profile_id = v_uid
    order by created_at desc limit 1;
  if v_teacher is null then
    select * into v_teacher from public.teachers
      where tenant_id = v_profile.tenant_id
        and lower(btrim(full_name)) = lower(btrim(v_profile.full_name))
      order by created_at desc limit 1;
  end if;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  -- Binaan: anggota halaqah yang diampu ATAU teacher_students (data lama).
  if not exists (
    select 1 from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher.id and hs.student_id = p_student_id
  )
  and not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then
    raise exception 'SANTRI_BUKAN_BINAAN';
  end if;

  select * into v_student from public.students
    where id = p_student_id and tenant_id = v_profile.tenant_id;
  if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

  select * into v_material from public.tartil_materials
    where id = p_material_id and tenant_id = v_profile.tenant_id and is_active;
  if v_material is null then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  select mode into v_mode from public.tahfidz_settings where tenant_id = v_profile.tenant_id;
  v_mode := coalesce(v_mode, 'HURUF');

  if p_status not in ('BELUM', 'DIPELAJARI', 'DINILAI') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_status := p_status::public.tahfidz_progress;

  -- Validasi nilai sesuai mode lembaga (rule #46: satu sumber konfigurasi).
  if v_status = 'DINILAI' then
    if v_mode = 'ANGKA' then
      if p_score_value is null or p_score_value < 1 or p_score_value > 100 then
        raise exception 'NILAI_TIDAK_VALID';
      end if;
    elsif v_mode = 'HURUF' then
      if p_score_label is null or btrim(p_score_label) = '' then
        raise exception 'NILAI_TIDAK_VALID';
      end if;
      if not exists (
        select 1 from public.tahfidz_grade_settings g
        where g.tenant_id = v_profile.tenant_id and g.is_active
          and upper(btrim(g.label)) = upper(btrim(p_score_label))
      ) then
        raise exception 'GRADE_TIDAK_VALID';
      end if;
    end if;
  else
    if p_score_value is not null or (p_score_label is not null and btrim(p_score_label) <> '') then
      raise exception 'NILAI_TIDAK_VALID';
    end if;
  end if;

  -- Edit? Pastikan baris milik tenant & guru yang sama.
  if p_assessment_id is not null then
    if not exists (
      select 1 from public.tartil_assessments a
      where a.id = p_assessment_id
        and a.tenant_id = v_profile.tenant_id
        and (a.teacher_id is null or a.teacher_id = v_teacher.id)
        and a.deleted_at is null
    ) then
      raise exception 'PENILAIAN_TIDAK_DITEMUKAN';
    end if;
  end if;

  perform set_config('app.tenant_id', v_profile.tenant_id::text, true);

  insert into public.tartil_assessments (
    tenant_id, student_id, material_id, teacher_id, assessed_by, assessed_at,
    pages_label, status, score_value, score_label, free_note
  ) values (
    v_profile.tenant_id, p_student_id, p_material_id, v_teacher.id, v_uid,
    coalesce(nullif(current_setting('app.tartil_assessed_at', true), '')::timestamptz, now()),
    nullif(btrim(coalesce(p_pages_label, '')), ''), v_status,
    case when v_status = 'DINILAI' and v_mode = 'ANGKA' then p_score_value else null end,
    case when v_status = 'DINILAI' and v_mode = 'HURUF' then upper(btrim(p_score_label)) else null end,
    nullif(btrim(coalesce(p_free_note, '')), '')
  )
  returning id into v_id;

  -- Catatan terstruktur (max 5 slot — rule #12).
  v_key := '';
  for v_key in select k from (select jsonb_object_keys(p_notes) as k) kk
  loop
    if v_key not in ('APRESIASI','BACAAN','FASHOHAH','SARAN','CATATAN_ORANG_TUA') then
      raise exception 'SLOT_CATATAN_TIDAK_VALID';
    end if;
    if coalesce(jsonb_typeof(p_notes -> v_key), 'null') <> 'string' then
      raise exception 'SLOT_CATATAN_TIDAK_VALID';
    end if;
    insert into public.tartil_assessment_notes (tenant_id, assessment_id, slot, content)
    values (
      v_profile.tenant_id, v_id, v_key::public.tartil_note_slot,
      left(btrim(p_notes ->> v_key), 500)
    )
    on conflict (assessment_id, slot)
    do update set content = excluded.content;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid) from public;
grant execute on function public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Bulk RPC V67 kini menerima tanggal opsional (default null = pakai now()).
-- -----------------------------------------------------------------------------
drop function if exists public.tartil_save_assessments_bulk(jsonb);

create or replace function public.tartil_save_assessments_bulk(
  p_items       jsonb,
  p_assessed_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'BATCH_KOSONG';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'BATCH_TERLALU_BESAR';
  end if;

  if p_assessed_at is not null and p_assessed_at > now() then
    raise exception 'TANGGAL_MASSAL_TIDAK_VALID';
  end if;

  -- Override tanggal batch — lokal TERHADAP TRANSAKSI ini (hilang otomatis),
  -- jadi panggilan lain (mis. penilaian tunggal yang bersamaan) tak terpengaruh.
  -- CATATAN PENTING (bugfix terhadap pola V67 & V3): PL/pgSQL FOREACH … IN
  -- ARRAY tidak mendukung jsonb (jsonb bukan array Postgres — error 42804 saat
  -- dipanggil). Loop di sini memakai jsonb_array_elements.
  perform set_config('app.tartil_assessed_at', coalesce(p_assessed_at::text, ''), true);

  for v_item in select elem from jsonb_array_elements(p_items) as elem loop
    perform public.tartil_save_assessment(
      (v_item->>'student_id')::uuid,
      (v_item->>'material_id')::uuid,
      v_item->>'pages_label',
      v_item->>'status',
      (v_item->>'score_value')::integer,
      v_item->>'score_label',
      v_item->>'free_note',
      coalesce(v_item->'notes', '{}'::jsonb),
      (v_item->>'assessment_id')::uuid
    );
  end loop;
end;
$$;

revoke execute on function public.tartil_save_assessments_bulk(jsonb, timestamptz) from public;
grant execute on function public.tartil_save_assessments_bulk(jsonb, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. BUGFIX V3 yang ikut terbawa: `tahfidz_save_assessments_bulk` memakai pola
--    FOREACH … IN ARRAY untuk jsonb — selalu error 42804 saat dipanggil, sehingga
--    fitur "input penilaian Tahfidz massal" numpang rusak sejak V3. Loop diperbaiki
--    ke jsonb_array_elements; validasi batch (max 200) dan transaksi tidak berubah.
-- -----------------------------------------------------------------------------
drop function if exists public.tahfidz_save_assessments_bulk(jsonb);

create or replace function public.tahfidz_save_assessments_bulk(p_items jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'BATCH_KOSONG';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'BATCH_TERLALU_BESAR';
  end if;

  for v_item in select elem from jsonb_array_elements(p_items) as elem loop
    perform public.tahfidz_save_assessment(
      (v_item->>'student_id')::uuid,
      (v_item->>'tenant_surah_id')::uuid,
      v_item->>'status',
      (v_item->>'score_value')::integer,
      v_item->>'score_label',
      v_item->>'note'
    );
  end loop;
end;
$$;

revoke execute on function public.tahfidz_save_assessments_bulk(jsonb) from public;
grant execute on function public.tahfidz_save_assessments_bulk(jsonb) to authenticated;
