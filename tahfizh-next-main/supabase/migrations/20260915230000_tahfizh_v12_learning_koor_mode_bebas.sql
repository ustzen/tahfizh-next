-- ============================================================================
-- TAHFIZH V12.7 — Hadits & Doa Harian: Guru + Koordinator + Mode Bebas
-- ============================================================================
-- Permintaan (V12.7):
--   1. KOORDINATOR (dan tentu Guru) bisa MENAMBAH materi Hadits & Doa Harian
--      dan MEMBERIKAN NILAINYA untuk setiap anak.
--   2. Mode penilaian BEBAS DIPILIH per penilaian (Centang/Huruf/Angka) —
--      tidak lagi terkunci pengaturan lembaga (V3 settings tetap jadi default
--      di form, tapi guru/koordinator boleh memilih lain).
--
-- Perubahan SQL (idempoten — drop+create ulang satu-satunya RPC ini):
--   learning_save_assessment v2:
--     a) Binaan via HALAQAH: relasi teacher_students (view 15150000) yang lama
--        DIPERLUAS — USTADZ tetap wajib mengampu halaqah santri, sementara
--        ADMIN & KOORDINATOR lembaga boleh menilai SELURUH santri lembaga
--        (paritas dengan teacher_students_list / students_manager_list).
--     b) Mode bebas: parameter p_mode opsional — bila NULL dipakai mode
--        lembaga (backward compatible). Validasi nilai mengikuti mode terpilih:
--        CENTANG (label "✓"), HURUF (grade tahfidz_grade_settings lembaga),
--        ANGKA (1-100). Mode tersimpan di mode_at_entry_cache (jejak histori).
--   (Tidak ada perubahan tabel/RLS — modul materi CRUD sudah terbuka untuk
--    ADMIN/KOORDINATOR lewat RLS existing; cukup dibuka di action server.)
-- ============================================================================

drop function if exists public.learning_save_assessment(
  uuid, text, uuid, date, text, integer, text, text, jsonb, uuid
);

create or replace function public.learning_save_assessment(
  p_student_id    uuid,
  p_module        text,                       -- HADITS | DOA | TAJWID
  p_material_id   uuid,
  p_assessed_date date default current_date,
  p_status        text default 'LULUS',
  p_score_value   integer default null,
  p_score_label   text default null,
  p_free_note     text default null,
  p_notes         jsonb default '{}'::jsonb,
  p_assessment_id uuid default null,          -- set = EDIT own record (rule #27 V5 pattern)
  p_mode          text default null           -- V12.7: mode bebas per penilaian (null = mode lembaga)
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_teacher  public.teachers;
  v_mode     public.tahfidz_mode;
  v_module   public.learning_module;
  v_status   public.learning_status;
  v_id       uuid;
  v_key      text;
  v_is_binaan boolean;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V12.7: USTADZ menilai (seperti sebelumnya); ADMIN & KOORDINATOR lembaga
  -- kini juga boleh menilai hadits/doa/tajwid untuk santri lembaganya.
  if v_profile.role not in ('USTADZ', 'ADMIN', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_profile.role = 'USTADZ' then
    select * into v_teacher from public.teachers
      where tenant_id = v_profile.tenant_id
        and full_name ilike v_profile.full_name
      order by created_at desc limit 1;
    if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;
  end if;

  -- Santri wajib satu tenant (semua role).
  if not exists (
    select 1 from public.students s
    where s.id = p_student_id and s.tenant_id = v_profile.tenant_id
  ) then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  -- Binaan: USTADZ via halaqah yang diampu (view teacher_students turunan
  -- halaqah); ADMIN/KOORDINATOR: seluruh santri aktif lembaga.
  if v_profile.role = 'USTADZ' then
    select exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs
        on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher.id and hs.student_id = p_student_id
    ) into v_is_binaan;
    if not v_is_binaan then
      raise exception 'SANTRI_BUKAN_BINAAN';
    end if;
  end if;

  if p_module not in ('HADITS', 'DOA', 'TAJWID') then
    raise exception 'MODUL_TIDAK_VALID';
  end if;
  v_module := p_module::public.learning_module;

  -- Material must be an ACTIVE row of THIS tenant in the right module table.
  if v_module = 'HADITS' and not exists (
    select 1 from public.hadith_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  if v_module = 'DOA' and not exists (
    select 1 from public.daily_prayer_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  if v_module = 'TAJWID' and not exists (
    select 1 from public.tajwid_materials m
    where m.id = p_material_id and m.tenant_id = v_profile.tenant_id and m.is_active
  ) then raise exception 'MATERI_TIDAK_AKTIF'; end if;

  -- Status per module (rule #9/#18): Hadits/Doa vs Tajwid vocabularies.
  if p_status not in ('LULUS', 'PERLU_MENGULANG', 'BELUM_SELESAI',
                      'MENGUASAI', 'PERLU_LATIHAN', 'BELUM_MENGUASAI') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_status := p_status::public.learning_status;
  if (v_module in ('HADITS', 'DOA') and v_status in ('MENGUASAI', 'PERLU_LATIHAN', 'BELUM_MENGUASAI'))
     or (v_module = 'TAJWID' and v_status in ('LULUS', 'PERLU_MENGULANG', 'BELUM_SELESAI')) then
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  if p_assessed_date is null
     or p_assessed_date > (current_date + interval '7 days')::date
     or p_assessed_date < (current_date - interval '1 year')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  -- Structured notes: ≤ 5 slots, per-module slot vocabulary, each 1..500 chars.
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    if (select count(*) from jsonb_object_keys(p_notes)) > 5 then
      raise exception 'CATATAN_TIDAK_VALID';
    end if;
    for v_key in select jsonb_object_keys(p_notes) loop
      if not exists (
        select 1 from unnest(case v_module
          when 'HADITS' then array['APRESIASI','HAFALAN','BACAAN','SARAN','CATATAN_ORANG_TUA']
          when 'DOA'    then array['APRESIASI','HAFALAN','PELAFALAN','PENGAMALAN','CATATAN_ORANG_TUA']
          else               array['PEMAHAMAN','PENERAPAN','KESALAHAN','SARAN','CATATAN_ORANG_TUA']
        end) e
        where e = v_key
      ) then
        raise exception 'CATATAN_TIDAK_VALID';
      end if;
      if coalesce(p_notes ->> v_key, '') = '' then
        raise exception 'CATATAN_TIDAK_VALID';
      end if;
      if char_length(p_notes ->> v_key) > 500 then
        raise exception 'CATATAN_TERLALU_PANJANG';
      end if;
    end loop;
  end if;

  -- V12.7 MODE BEBAS: p_mode diisi → dipakai; kosong → mode lembaga (V3).
  v_mode := coalesce(
    nullif(p_mode, ''),
    coalesce(public.tahfidz_settings_mode(v_profile.tenant_id), 'CENTANG')
  )::public.tahfidz_mode;

  if v_mode = 'ANGKA' then
    if p_score_value is null or p_score_value < 1 or p_score_value > 100 then
      raise exception 'NILAI_ANGKA_TIDAK_VALID';
    end if;
    p_score_label := null;
  elsif v_mode = 'HURUF' then
    if p_score_label is null or not exists (
      select 1 from public.tahfidz_grade_settings g
      where g.tenant_id = v_profile.tenant_id and g.label = p_score_label
    ) then
      raise exception 'GRADE_TIDAK_VALID';
    end if;
    p_score_value := null;
  else -- CENTANG
    p_score_value := null;
    p_score_label := null;
  end if;

  if p_free_note is not null and char_length(p_free_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;

  if p_assessment_id is not null then
    -- EDIT: pemilik record di tenant ini (guru pemilik, atau admin/koor lembaga).
    select id into v_id from public.learning_assessments
    where id = p_assessment_id
      and tenant_id = v_profile.tenant_id
      and deleted_at is null
      and (
        (v_profile.role = 'USTADZ' and teacher_id = v_teacher.id)
        or v_profile.role in ('ADMIN', 'KOORDINATOR')
      );
    if v_id is null then raise exception 'ASSESSMENT_TIDAK_DITEMUKAN'; end if;

    update public.learning_assessments set
      module_type   = v_module,
      hadith_id     = case when v_module = 'HADITS' then p_material_id else null end,
      prayer_id     = case when v_module = 'DOA'    then p_material_id else null end,
      tajwid_id     = case when v_module = 'TAJWID' then p_material_id else null end,
      assessed_date = p_assessed_date,
      status        = v_status,
      score_value   = p_score_value,
      score_label   = p_score_label,
      free_note     = p_free_note
    where id = v_id;
  else
    -- Rule #51: no unique(student, material, date) — repeat sessions are legit.
    insert into public.learning_assessments (
      tenant_id, student_id, teacher_id, created_by, module_type,
      hadith_id, prayer_id, tajwid_id, assessed_date, status,
      score_value, score_label, free_note
    ) values (
      v_profile.tenant_id, p_student_id,
      case when v_profile.role = 'USTADZ' then v_teacher.id end,
      v_uid, v_module,
      case when v_module = 'HADITS' then p_material_id end,
      case when v_module = 'DOA'    then p_material_id end,
      case when v_module = 'TAJWID' then p_material_id end,
      p_assessed_date, v_status, p_score_value, p_score_label, p_free_note
    )
    returning id into v_id;
  end if;

  delete from public.learning_assessment_notes where assessment_id = v_id;
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    insert into public.learning_assessment_notes (tenant_id, assessment_id, slot, content)
    select v_profile.tenant_id, v_id, k, p_notes ->> k
    from jsonb_object_keys(p_notes) k;
  end if;

  return v_id;
end;
$$;

grant execute on function public.learning_save_assessment(
  uuid, text, uuid, date, text, integer, text, text, jsonb, uuid, text
) to authenticated;
