-- ============================================================================
-- TAHFIZH V73 — BUGFIX TARTIL: MODE PER PENILAIAN + CEK PENILAIAN PER TANGGAL
-- ============================================================================
-- Dua masalah yang dilaporkan guru:
--
-- A. "Ketika mode penilaian diubah jadi huruf atau angka, semua ikut berubah,
--    tapi di riwayat modenya tetap centang."
--    Penyebab: RPC `tartil_save_assessment` memvalidasi & menyimpan skor HANYA
--    sesuai mode lembaga (tartil_settings). Guru boleh memilih Centang/Huruf/
--    Angka di form, tetapi bila pilihannya tidak sama dengan mode lembaga,
--    skor huruf/angka DIRESTRIKSI (label di-NULL-kan) — hasilnya riwayat
--    menampilkan centang, bukan huruf/angka yang diketik guru.
--    Perbaikan: skor disimpan SEBAGAIMANA guru mengisinya (label &/or angka),
--    validasi hanya menolak data yang memang tidak lengkap/invalid. Riwayat
--    menampilkan apa yang tersimpan. (Ini mengembalikan semantik V4: insert
--    menyimpan apa yang dikirim; centang = skor kosong.)
--
-- B. "Ketika guru menilai santri di tanggal tertentu, lalu memilih tanggal itu
--    lagi, penilaian yang sudah ada harus langsung muncul."
--    Perbaikan: RPC baru `tartil_assessments_on_date(p_date)` — daftar
--    penilaian guru pada satu hari WIB (teacher dari session). Untuk form
--    jurnal & massal.
--
-- Tidak ada perubahan skema: hanya definisi ulang RPC + RPC baru. Idempoten.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tartil_save_assessment — skor disimpan sesuai input guru (mode-agnostic)
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid);
drop function if exists public.tartil_save_assessment(uuid, uuid, text, text, integer, text, text, jsonb, uuid, timestamptz);

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
  v_student  public.students;
  v_material public.tartil_materials;
  v_status   public.tahfidz_progress;
  v_label    text;
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

  if p_status not in ('BELUM', 'DIPELAJARI', 'DINILAI') then
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  v_status := p_status::public.tahfidz_progress;

  v_label := nullif(btrim(coalesce(p_score_label, '')), '');

  -- V73 — Validasi & penyimpanan MODE-AGNOSTIC: apa yang guru isi di form itu
  -- yang tersimpan (huruf tetap huruf, angka tetap angka, centang tetap ✓).
  -- Riwayat menampilkan skor apa adanya — tidak "di-reset ke mode lembaga".
  if v_status = 'DINILAI' then
    -- Keduanya terisi sekaligus = tidak valid.
    if v_label is not null and p_score_value is not null then
      raise exception 'NILAI_TIDAK_VALID';
    end if;
    if v_label is not null then
      -- Grade huruf harus ada di daftar grade aktif lembaga (sumber dengan UI).
      if not exists (
        select 1 from public.tahfidz_grade_settings g
        where g.tenant_id = v_profile.tenant_id and g.is_active
          and upper(btrim(g.label)) = upper(v_label)
      ) then
        raise exception 'GRADE_TIDAK_VALID';
      end if;
    elsif p_score_value is not null then
      if p_score_value < 1 or p_score_value > 100 then
        raise exception 'NILAI_TIDAK_VALID';
      end if;
    end if;
    -- Keduanya kosong = CENTANG (✓ Lancar) — valid, seperti perilaku lama.
  else
    -- BELUM / DIPELAJARI: tidak boleh membawa skor.
    if v_label is not null or p_score_value is not null then
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
    case when v_status = 'DINILAI' and v_label is null then p_score_value else null end,
    case when v_status = 'DINILAI' and v_label is not null then upper(v_label) else null end,
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

-- ---------------------------------------------------------------------------
-- 2. tartil_save_assessments_bulk — validasi item sesuai aturan baru supaya
--    pesan error konsisten; penulisan tetap via RPC satuan (mode-agnostic).
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_save_assessments_bulk(jsonb, timestamptz);
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
  v_item   jsonb;
  v_count  integer;
  v_label  text;
  v_value  integer;
  v_status text;
  v_tenant uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'BATCH_KOSONG';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'BATCH_TERLALU_BESAR';
  end if;

  select tenant_id into v_tenant from public.profiles where id = auth.uid();
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  if p_assessed_at is not null and p_assessed_at > now() then
    raise exception 'TANGGAL_MASSAL_TIDAK_VALID';
  end if;

  -- Override tanggal batch — lokal TERHADAP TRANSAKSI ini (hilang otomatis).
  perform set_config('app.tartil_assessed_at', coalesce(p_assessed_at::text, ''), true);

  for v_item in select elem from jsonb_array_elements(p_items) as elem loop
    v_status := v_item->>'status';
    v_label  := nullif(btrim(coalesce(v_item->>'score_label', '')), '');
    v_value  := (v_item->>'score_value')::integer;

    -- Validasi mode-agnostic yang sama dengan RPC satuan (fail fast per item,
    -- pesan error sama, tidak setengah-batch-tertulis karena exception void
    -- me-rollback seluruh transaksi).
    if v_status not in ('BELUM','DIPELAJARI','DINILAI') then
      raise exception 'STATUS_TIDAK_VALID';
    end if;
    if v_status = 'DINILAI' then
      if v_label is not null and v_value is not null then
        raise exception 'NILAI_TIDAK_VALID';
      end if;
      if v_label is not null then
        if not exists (
          select 1 from public.tahfidz_grade_settings g
          where g.tenant_id = v_tenant and g.is_active
            and upper(btrim(g.label)) = upper(v_label)
        ) then
          raise exception 'GRADE_TIDAK_VALID';
        end if;
      elsif v_value is not null then
        if v_value < 1 or v_value > 100 then
          raise exception 'NILAI_TIDAK_VALID';
        end if;
      end if;
      -- Keduanya kosong = CENTANG (✓ Lancar) — valid.
    elsif v_label is not null or v_value is not null then
      raise exception 'NILAI_TIDAK_VALID';
    end if;

    perform public.tartil_save_assessment(
      (v_item->>'student_id')::uuid,
      (v_item->>'material_id')::uuid,
      v_item->>'pages_label',
      v_item->>'status',
      v_value,
      v_label,
      v_item->>'free_note',
      coalesce(v_item->'notes', '{}'::jsonb),
      (v_item->>'assessment_id')::uuid
    );
  end loop;
end;
$$;

revoke execute on function public.tartil_save_assessments_bulk(jsonb, timestamptz) from public;
grant execute on function public.tartil_save_assessments_bulk(jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. tartil_assessments_on_date — penilaian guru pada SATU HARI WIB.
--    Teacher diambil dari session (aman). Dipakai untuk cek "santri ini sudah
--    dinilai pada tanggal itu" pada form jurnal & massal.
-- ---------------------------------------------------------------------------
create or replace function public.tartil_assessments_on_date(
  p_date date
)
returns table (
  student_id    uuid,
  material_id   uuid,
  pages_label   text,
  status        public.tahfidz_progress,
  score_value   integer,
  score_label   text,
  free_note     text,
  assessment_id uuid
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
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select t.id into v_teacher from public.teachers t
    where t.tenant_id = v_tenant and t.profile_id = v_uid
    order by t.created_at desc limit 1;
  if v_teacher is null then
    select t.id into v_teacher from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc limit 1;
  end if;
  if v_teacher is null then raise exception 'GURU_TIDAK_DITEMUKAN'; end if;

  return query
  select a.student_id, a.material_id, a.pages_label, a.status,
         a.score_value, a.score_label, a.free_note, a.id
  from public.tartil_assessments a
  where a.tenant_id = v_tenant
    and a.teacher_id = v_teacher
    and (a.assessed_at at time zone 'Asia/Jakarta')::date = p_date
    and a.deleted_at is null
  order by a.assessed_at desc;
end;
$$;

revoke execute on function public.tartil_assessments_on_date(date) from public;
grant execute on function public.tartil_assessments_on_date(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. KARTU PRESTASI — score_mode baris Tartil kini dari skor tersimpan.
--    Aplikasi memanggil `tartil_student_timeline` (versi V4: TARTIL+TAHFIDZ).
--    Superset 7-cabang bernama `tahfidz_student_timeline` dipakai panel lain
--    dan cabang TARTIL-nya mengikuti pola yang sama — tidak diubah di sini
--    (di luar lingkup laporan guru).
--    Sebelumnya baris Tartil memakai mode lembaga (`tahfidz_settings_mode`)
--    sehingga Kartu Prestasi ikut berubah saat mode lembaga diubah.
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_student_timeline(uuid, text);

create or replace function public.tartil_student_timeline(
  p_student_id uuid,
  p_module     text default 'ALL'   -- ALL | TARTIL | TAHFIDZ
)
returns table (
  module      text,
  occurred_at timestamptz,
  title       text,
  subtitle    text,
  score_label text,
  score_value integer,
  score_mode  text,
  status      public.tahfidz_progress,
  teacher_name text,
  notes_json  jsonb,
  ref_id      uuid,
  change_kind text
)
language sql
security definer set search_path = public
as $$
  select * from (
    select
      'TARTIL'::text as module,
      h.assessed_at as occurred_at,
      m.name as title,
      coalesce(h.pages_label, '') as subtitle,
      h.score_label,
      h.score_value,
      -- V73: mode per penilaian mengikuti skor tersimpan (bukan setelan lembaga).
      case when h.score_label is not null then 'HURUF'
           when h.score_value is not null then 'ANGKA'
           else 'CENTANG' end::text as score_mode,
      h.status,
      t.full_name as teacher_name,
      h.notes_snapshot as notes_json,
      h.assessment_id as ref_id,
      h.change_kind
    from public.tartil_assessment_history h
    join public.tartil_materials m on m.id = h.material_id
    left join public.teachers t on t.id = h.teacher_id
    where h.student_id = p_student_id
      and h.tenant_id = public.current_tenant_id()
      and h.change_kind in ('CREATE', 'UPDATE')

    union all

    -- TAHFIDZ — mode_at_entry sudah per penilaian, tidak berubah (rule #19).
    select
      'TAHFIDZ'::text,
      th.created_at,
      coalesce(ts.name_override, gs.name, 'Surat'),
      ''::text,
      th.score_label,
      th.score_value,
      th.mode_at_entry::text,
      th.status,
      t2.full_name,
      jsonb_build_object('catatan', th.note),
      th.assessment_id,
      th.change_kind
    from public.tahfidz_assessment_history th
    join public.tahfidz_tenant_surahs ts on ts.id = th.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    left join public.teachers t2 on t2.id = th.teacher_id
    where th.student_id = p_student_id
      and th.tenant_id = public.current_tenant_id()
      and th.status = 'DINILAI'
  ) combined
  where (p_module = 'ALL' or module = p_module)
  order by occurred_at desc
  limit 200;
$$;
