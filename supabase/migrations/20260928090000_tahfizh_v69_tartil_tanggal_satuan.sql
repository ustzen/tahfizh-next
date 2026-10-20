-- ============================================================================
-- TAHFIZH V69 — TANGGAL PENILAIAN pada INPUT PER SANTRI (tartil_save_assessment)
-- ============================================================================
-- Sensibilitas: V68 memberi tanggal pada input MASSAL. Kini input PER SANTRI
-- mendapat perlakuan sama: guru boleh menetapkan tanggal penilaian (mis. data
-- kertas lama / menandai sebelumnya yang lupa dicatat).
--
-- Perubahan:
--   * `tartil_save_assessment` menerima `p_assessed_at timestamptz default null`
--     (parameter ke-10, opsional — pemanggil lama & bulk tidak berubah).
--   * p_assessed_at di masa depan → ditolak 'TANGGAL_TIDAK_VALID'.
--   * Override dipancarkan lewat GUC lokal-transaksi yang SAMA dengan V68,
--     dan hanya di-set saat p_assessed_at diberikan — sehingga override dari
--     bulk (V68) TIDAK ikut terhapus saat fungsi ini dipanggil dengan nilai
--     null oleh bulk (mencegah jawaban 'now()' yang salah pada batch).
--
-- Idempoten: drop/create ulang (aman rerun).
-- ============================================================================

drop function if exists public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid);

create or replace function public.tartil_save_assessment(
  p_student_id  uuid,
  p_material_id uuid,
  p_pages_label text default null,
  p_status      text default 'DINILAI',
  p_score_value integer default null,
  p_score_label text default null,
  p_free_note   text default null,
  p_notes       jsonb default '{}'::jsonb,
  p_assessment_id uuid default null,
  p_assessed_at   timestamptz default null
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

  if p_assessed_at is not null and p_assessed_at > now() then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  -- Override tanggal (V69) — hanya saat diberikan. Jangan menimpa GUC dengan
  -- '' saat null: bulk (V68) sudah men-set GUC lokal-transaksinya sendiri
  -- sebelum memanggil fungsi ini, dan nilai itu harus tetap hidup.
  if p_assessed_at is not null then
    perform set_config('app.tartil_assessed_at', p_assessed_at::text, true);
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

revoke execute on function public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid, timestamptz) from public;
grant execute on function public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid, timestamptz) to authenticated;
