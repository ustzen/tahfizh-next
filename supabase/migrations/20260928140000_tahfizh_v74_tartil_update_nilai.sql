-- ============================================================================
-- TAHFIZH V74 — BUGFIX TARTIL: EDIT/UPDATE PENILAIAN (tanpa duplikat)
-- ============================================================================
-- Konteks laporan guru:
--   "Saat guru memilih tanggal tertentu dan santri sudah punya nilai di tanggal
--    itu, nilai harus tampil di form pengisian dan guru bisa membiarkan saja
--    ATAU meng-update nilainya."
--   Form massal kini mengisi otomatis baris yang sudah bernilai (prefill) dan
--   mengirim `assessment_id` agar simpan = UPDATE baris yang sama — bukan
--   menambah duplikat di riwayat.
--
-- Masalah yang diperbaiki: sejak V12 penguatan `tartil_save_assessment` baru
-- memvalidasi keberadaan `p_assessment_id` lalu TETAP INSERT baris baru —
-- "edit" menghasilkan duplikat, bukan pembaruan. Registrasi V4 (rule #39)
-- semula benar (update). Fungsi ini mengembalikan jalur UPDATE dengan
-- menjaga semua kelakuan baru:
--   * validasi mode-agnostic (V73) — skor ditulis apa adanya;
--   * override tanggal via GUC `app.tartil_assessed_at` (V68/V69);
--   * `assessed_at` TIDAK berubah kecuali ada override — edit nilai bawaan
--     tidak boleh menggeser tanggal penilaian lama;
--   * security definer + search_path public, hak eksekusi sama.
--   * Perbaikan extra dari laporan "gagal terus": validasi grade memakai
--     `tahfidz_grade_settings.is_active` — kolom itu TIDAK ADA (skema V3),
--     sehingga tiap simpan HURUF melempar 42703 "column does not exist"
--     dan di app muncul pesan umum "Penilaian belum berhasil disimpan".
--     Grade kini divalidasi seperti V3: label harus milik lembaga ini.
--   * RPC massal `tartil_save_assessments_bulk` didefinisikan ulang dengan
--     validasi grade yang sama (tanpa is_active).
--
-- Tidak ada perubahan skema. Idempoten (drop + create). Data aman.
-- ============================================================================

-- Pendeteksi aman: tabel dasar harus sudah ada (migrasi V1..V67).
do $$
begin
  if not exists (select 1 from pg_class where relname = 'tartil_assessments' and relnamespace = 'public'::regnamespace)
     or not exists (select 1 from pg_class where relname = 'profiles' and relnamespace = 'public'::regnamespace) then
    raise exception 'SKEMA_BELUM_LENGKAP: tabel dasar migrasi awal tidak ditemukan (profiles=%, tartil_assessments=%). Jalankan seluruh migrasi supabase/migrations/ berurutan atau file supabase/tahfizh-combined.sql sebelum V74.',
      coalesce((select relname from pg_class where oid = to_regclass('public.profiles')), 'TIDAK ADA'),
      coalesce((select relname from pg_class where oid = to_regclass('public.tartil_assessments')), 'TIDAK ADA');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- tartil_save_assessment — identik dengan versi V73 (mode-agnostic + override
-- tanggal), ditambah jalur UPDATE saat p_assessment_id diberikan.
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
  if v_status = 'DINILAI' then
    -- Keduanya terisi sekaligus = tidak valid.
    if v_label is not null and p_score_value is not null then
      raise exception 'NILAI_TIDAK_VALID';
    end if;
    if v_label is not null then
      -- Grade huruf harus ada di daftar nilai lembaga ini (pola V3 — TANPA
      -- kolom is_active yang tidak ada di skema; lihat header).
      if not exists (
        select 1 from public.tahfidz_grade_settings g
        where g.tenant_id = v_profile.tenant_id
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

  perform set_config('app.tenant_id', v_profile.tenant_id::text, true);

  if p_assessment_id is not null then
    -- V74 — EDIT: pastikan baris milik tenant & guru ini, lalu UPDATE (bukan
    -- insert duplikat seperti versi V12/V73). Tanggal hanya berubah bila
    -- override (GUC) aktif; tanpa override tanggal lama tetap dipertahankan.
    select id into v_id from public.tartil_assessments
      where id = p_assessment_id
        and tenant_id = v_profile.tenant_id
        and deleted_at is null
        and (teacher_id is null or teacher_id = v_teacher.id);
    if v_id is null then raise exception 'PENILAIAN_TIDAK_DITEMUKAN'; end if;

    update public.tartil_assessments set
      material_id = p_material_id,
      pages_label = nullif(btrim(coalesce(p_pages_label, '')), ''),
      assessed_at = coalesce(
        nullif(current_setting('app.tartil_assessed_at', true), '')::timestamptz,
        assessed_at
      ),
      status      = v_status,
      score_value = case when v_status = 'DINILAI' and v_label is null then p_score_value else null end,
      score_label = case when v_status = 'DINILAI' and v_label is not null then upper(v_label) else null end,
      free_note   = nullif(btrim(coalesce(p_free_note, '')), '')
    where id = v_id;
  else
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
  end if;

  -- Catatan terstruktur (max 5 slot — rule #12). Update tetap menyinkronkan.
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
-- tartil_save_assessments_bulk — identik dengan V73 (jsonb_array_elements,
-- batch max 200, override tanggal transaksi-lokal) dengan validasi item yang
-- sama tapi TANPA kolom is_active grade. Edit per item tetap lewat
-- `assessment_id` (V74: update di tempat, bukan duplikat).
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_save_assessments_bulk(jsonb);
drop function if exists public.tartil_save_assessments_bulk(jsonb, timestamptz);

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

    -- Validasi sama dengan RPC satuan (fail fast per item — exception void
    -- me-rollback seluruh batch, tidak ada setengah-batch-tertulis).
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
          where g.tenant_id = v_tenant
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
