-- ============================================================================
-- TAHFIZH V12.11 — Setoran Multi-Modul (3 tab: Tahfidz / Hadits / Doa Harian)
-- ============================================================================
-- Menu Setoran kini punya 3 tab — Tahfidz Al-Qur'an, Hadits, Doa Harian.
-- Guru menyetorkan lewat tab yang sesuai: data OTOMATIS terinput ke modul
-- terkait (tahfidz_submissions untuk Tahfidz; learning_assessments untuk
-- Hadits & Doa) — sehingga langsung tampil di menu modul dan dasbor santri.
-- Mode nilai (CENTANG/HURUF/ANGKA) bisa dipilih SENDIRI per tab, dan catatan
-- punya template cepat per slot.
--
-- 1. tahfidz_save_submission v2 — tambah p_mode (mode bebas per setoran;
--    null = mode lembaga, kompatibel dengan pemanggilan lama).
-- 2. RPC setoran_wali_summary() — setoran terakhir (3 modul) per anak untuk
--    dasbor santri (wali), SECURITY DEFINER, hanya anak yang terhubung.
-- ============================================================================

drop function if exists public.tahfidz_save_submission(
  uuid, uuid, text, text, date, text, integer, text, text, jsonb, uuid
);

create or replace function public.tahfidz_save_submission(
  p_student_id    uuid,
  p_tenant_surah_id uuid,
  p_kind          text default 'HAFALAN_BARU',
  p_ayat_label    text default null,
  p_assessed_date date default current_date,
  p_result        text default 'LULUS',
  p_score_value   integer default null,
  p_score_label   text default null,
  p_free_note     text default null,
  p_notes         jsonb default '{}'::jsonb,  -- {"APRESIASI":"…","SARAN":"…"}
  p_submission_id uuid default null,          -- set = EDIT existing (rule #27)
  p_mode          text default null           -- V12.11: mode bebas (null = mode lembaga)
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_teacher public.teachers;
  v_mode    public.tahfidz_mode;
  v_kind    public.submission_kind;
  v_result  public.submission_result;
  v_id      uuid;
  v_key     text;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.tenant_id is null or v_profile.role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Teacher identity from the SESSION, never from the client (rule #31, #54).
  select * into v_teacher from public.teachers
    where tenant_id = v_profile.tenant_id
      and full_name ilike v_profile.full_name
    order by created_at desc limit 1;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  -- Assignment check (rule #32/#54): cross-teacher / cross-tenant refused.
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher.id and ts.student_id = p_student_id
  ) then
    raise exception 'SANTRI_BUKAN_BINAAN';
  end if;

  if not exists (
    select 1 from public.students s
    where s.id = p_student_id and s.tenant_id = v_profile.tenant_id
  ) then
    raise exception 'SANTRI_TIDAK_DITEMUKAN';
  end if;

  -- Rule #9: the surah must be an ACTIVE V3 tenant surah of THIS tenant.
  if not exists (
    select 1 from public.tahfidz_tenant_surahs ts2
    where ts2.id = p_tenant_surah_id
      and ts2.tenant_id = v_profile.tenant_id
      and ts2.is_active
  ) then
    raise exception 'SURAT_TIDAK_AKTIF';
  end if;

  if p_kind not in ('HAFALAN_BARU', 'MUROJAAH') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  v_kind := p_kind::public.submission_kind;

  if p_result not in ('LULUS', 'PERLU_MENGULANG', 'DITUNDA') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_result := p_result::public.submission_result;

  -- Rule #8: valid calendar date; not more than 1 year in the past/future.
  if p_assessed_date is null
     or p_assessed_date > (current_date + interval '7 days')::date
     or p_assessed_date < (current_date - interval '1 year')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  -- Structured notes: ≤ 5 slots, valid enum keys, each 1..500 chars.
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    if (select count(*) from jsonb_object_keys(p_notes)) > 5 then
      raise exception 'CATATAN_TIDAK_VALID';
    end if;
    for v_key in select jsonb_object_keys(p_notes) loop
      -- Membership check (a plain cast would RAISE on unknown keys).
      if not exists (
        select 1 from unnest(enum_range(null::public.submission_note_slot)) e
        where e::text = v_key
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

  -- V12.11 MODE BEBAS: p_mode diisi → dipakai; kosong → mode lembaga (V3).
  v_mode := coalesce(
    nullif(p_mode, ''),
    coalesce(public.tahfidz_settings_mode(v_profile.tenant_id), 'CENTANG')
  )::public.tahfidz_mode;

  if v_mode = 'ANGKA' then
    if p_score_value is null or p_score_value < 1 or p_score_value > 100 then
      raise exception 'NILAI_ANGKA_TIDAK_VALID';
    end if;
  elsif v_mode = 'HURUF' then
    if p_score_label is null or not exists (
      select 1 from public.tahfidz_grade_settings g
      where g.tenant_id = v_profile.tenant_id and g.label = p_score_label
    ) then
      raise exception 'GRADE_TIDAK_VALID';
    end if;
  else
    p_score_value := null; -- CENTANG mode ignores numeric payloads
    p_score_label := null;
  end if;

  if p_free_note is not null and char_length(p_free_note) > 500 then
    raise exception 'CATATAN_TERLALU_PANJANG';
  end if;
  if p_ayat_label is not null and char_length(p_ayat_label) > 60 then
    raise exception 'AYAT_TERLALU_PANJANG';
  end if;

  if p_submission_id is not null then
    -- EDIT (rule #27): only the owning teacher of THIS tenant may edit.
    select id into v_id from public.tahfidz_submissions
    where id = p_submission_id
      and tenant_id = v_profile.tenant_id
      and teacher_id = v_teacher.id
      and deleted_at is null;
    if v_id is null then raise exception 'SUBMISSION_TIDAK_DITEMUKAN'; end if;

    update public.tahfidz_submissions set
      tenant_surah_id = p_tenant_surah_id,
      kind            = v_kind,
      ayat_label      = p_ayat_label,
      assessed_date   = p_assessed_date,
      result          = v_result,
      score_value     = p_score_value,
      score_label     = p_score_label,
      free_note       = p_free_note
    where id = v_id;
  else
    -- Rule #49: NO unique constraint on (student, surah, date) — multiple
    -- setoran per day are legitimate. Double-submit is prevented in the UI
    -- (disabled button) and by idempotent history rows instead.
    insert into public.tahfidz_submissions (
      tenant_id, student_id, teacher_id, created_by, tenant_surah_id,
      kind, ayat_label, assessed_date, result, score_value, score_label, free_note
    ) values (
      v_profile.tenant_id, p_student_id, v_teacher.id, v_uid, p_tenant_surah_id,
      v_kind, p_ayat_label, p_assessed_date, v_result, p_score_value, p_score_label, p_free_note
    )
    returning id into v_id;
  end if;

  -- Replace structured notes atomically with the row (same transaction).
  delete from public.tahfidz_submission_notes where submission_id = v_id;
  if p_notes is not null and jsonb_typeof(p_notes) = 'object' then
    insert into public.tahfidz_submission_notes (tenant_id, submission_id, slot, content)
    select v_profile.tenant_id, v_id, k::public.submission_note_slot, p_notes ->> k
    from jsonb_object_keys(p_notes) as k
    on conflict (submission_id, slot) do update set content = excluded.content;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC setoran_wali_summary — setoran terakhir (3 modul) untuk dasbor santri
--    Sumber: tahfidz_submissions (Tahfidz) + learning_assessments (Hadits/Doa)
--    — tabel yang sama dengan yang ditulis guru, jadi selalu sinkron.
--    Hanya anak yang terhubung akun wali ini (guardian_students), satu tenant.
-- ---------------------------------------------------------------------------
drop function if exists public.setoran_wali_summary();

create or replace function public.setoran_wali_summary()
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
  v_rows     jsonb;
  v_limit    integer := 15;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role <> 'WALI_SANTRI' then
    raise exception 'AKSES_DITOLAK';
  end if;

  with anak as (
    select s.id as student_id, s.full_name as student_name
    from public.guardian_students gs
    join public.guardians g on g.id = gs.guardian_id
    join public.students s on s.id = gs.student_id
    where g.profile_id = v_uid and s.tenant_id = v_tenant::uuid
  ),
  setoran_tahfidz as (
    select
      a.student_id,
      'TAHFIDZ'::text as module,
      coalesce(ts.name_override, m.name, 'Surat') as title,
      concat_ws(' · ',
        case a.kind when 'HAFALAN_BARU' then 'Hafalan Baru' else 'Murojaah' end,
        nullif(a.ayat_label, '')
      ) as detail,
      a.result::text as status,
      a.score_label,
      a.score_value,
      a.free_note,
      t.full_name as teacher_name,
      a.assessed_date,
      a.created_at
    from public.tahfidz_submissions a
    join anak on anak.student_id = a.student_id
    left join public.tahfidz_tenant_surahs ts on ts.id = a.tenant_surah_id
    left join public.tahfidz_surahs m on m.id = ts.surah_id
    left join public.teachers t on t.id = a.teacher_id
    where a.tenant_id = v_tenant::uuid and a.deleted_at is null
  ),
  setoran_learning as (
    select
      a.student_id,
      a.module_type::text as module,
      coalesce(h.title, p.title, tj.title, 'Materi') as title,
      null::text as detail,
      a.status::text as status,
      a.score_label,
      a.score_value,
      a.free_note,
      t.full_name as teacher_name,
      a.assessed_date,
      a.created_at
    from public.learning_assessments a
    join anak on anak.student_id = a.student_id
    left join public.hadith_materials h on h.id = a.hadith_id
    left join public.daily_prayer_materials p on p.id = a.prayer_id
    left join public.tajwid_materials tj on tj.id = a.tajwid_id
    left join public.teachers t on t.id = a.teacher_id
    where a.tenant_id = v_tenant::uuid
      and a.deleted_at is null
      and a.module_type in ('HADITS', 'DOA')
  ),
  gabungan as (
    select * from setoran_tahfidz
    union all
    select * from setoran_learning
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId', student_id,
           'studentName', student_name,
           'module', module,
           'title', title,
           'detail', detail,
           'status', status,
           'scoreLabel', score_label,
           'scoreValue', score_value,
           'freeNote', free_note,
           'teacherName', teacher_name,
           'assessedDate', assessed_date
         ) order by assessed_date desc, created_at desc), '[]'::jsonb)
  into v_rows
  from (select * from gabungan order by assessed_date desc, created_at desc limit v_limit) x;

  return v_rows;
end;
$$;

grant execute on function public.setoran_wali_summary() to authenticated;
