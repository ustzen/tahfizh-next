-- ============================================================================
-- TAHFIZH V12.14 — TARTIL JURNAL MENGAJI (penilaian per sesi baca)
-- ============================================================================
--  LAYAR GURU (sesuai desain):
--    Pilih Santri -> Jilid (dipilih dari METODE, mis. "Ummi Jilid 1") ->
--    Dari Halaman + Sampai Halaman -> Nilai (mode lembaga: Huruf/Angka/
--    Centang) -> Catatan Guru (bebas + template APRESIASI dsb).
--    Satu form untuk SEMUA santri binaan; riwayat per santri tetap tersimpan
--    di histori (append-only, rule #38/#40).
--
--  METODE BACA (baru, per lembaga):
--    tabel tartil_methods — nama metode + jumlah jilid. Admin bisa tambah/
--    ubah/hapus (Iqro, Ummi, Tartili, Tilawati, Qiro'ati, Wafa, Yanbua, …).
--    Baris materi (jilid) di-generate otomatis ("Ummi Jilid 1", dst) ke
--    tartil_materials sehingga penilaian lama tetap valid.
--
--  SINKRON DASBOR SANTRI:
--    RPC tartil_wali_summary mengembalikan penilaian terakhir anak yang
--    terhubung akun wali (guardian_students) — ditampilkan di dasbor santri
--    bersanding dengan grid Tahfidz yang sudah ada.
--
--  PERBAIKAN PENYELARASAN:
--    tartil_save_assessment & tartil_teacher_summaries kini menemukan guru
--    via link UUID profil (teachers.profile_id, V12.11) dulu — fallback nama;
--    dan binaan via halaqah_teachers/halaqah_students ATAU teacher_students.
--
--  Idempoten: create table if not exists, DO-blok enum, drop+create RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel metode baca per lembaga + seed default
-- ---------------------------------------------------------------------------
create table if not exists public.tartil_methods (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  jilid_count integer not null default 0 check (jilid_count between 0 and 30),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists tartil_methods_tenant_idx
  on public.tartil_methods (tenant_id, is_active, sort_order);

drop trigger if exists tartil_methods_updated_at on public.tartil_methods;
do $tfx$ begin
  execute 'create trigger tartil_methods_updated_at
  before update on public.tartil_methods
  for each row execute function public.touch_updated_at()';
exception when duplicate_object then null; end $tfx$;

-- Seed default untuk tenant baru + backfill tenant lama (idempoten).
create or replace function public.tartil_seed_methods()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tartil_methods (tenant_id, name, jilid_count, sort_order) values
    (new.id, 'Iqro',     6, 1),
    (new.id, 'Ummi',     8, 2),
    (new.id, 'Tartili',  5, 3),
    (new.id, 'Tilawati', 6, 4),
    (new.id, 'Qiro''ati', 6, 5),
    (new.id, 'Wafa',     5, 6),
    (new.id, 'Yanbua',   6, 7),
    (new.id, 'Al-Qur''an', 0, 8)
  on conflict (tenant_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_tartil_seed_methods on public.tenants;
do $tfx$ begin
  execute 'create trigger tenants_tartil_seed_methods
  after insert on public.tenants
  for each row execute function public.tartil_seed_methods()';
exception when duplicate_object then null; end $tfx$;

create or replace function public.tartil_backfill_methods(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tartil_methods (tenant_id, name, jilid_count, sort_order)
  select p_tenant, v.name, v.jilid_count, v.sort_order
  from (values
    ('Iqro',     6, 1),
    ('Ummi',     8, 2),
    ('Tartili',  5, 3),
    ('Tilawati', 6, 4),
    ('Qiro''ati', 6, 5),
    ('Wafa',     5, 6),
    ('Yanbua',   6, 7),
    ('Al-Qur''an', 0, 8)
  ) as v(name, jilid_count, sort_order)
  where not exists (select 1 from public.tartil_methods t where t.tenant_id = p_tenant);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: daftar metode (guru & admin) + generate jilid ke materi
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_methods_list();

create or replace function public.tartil_methods_list()
returns table (
  id          uuid,
  name        text,
  jilid_count integer,
  sort_order  integer,
  is_active   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, m.jilid_count, m.sort_order, m.is_active
  from public.tartil_methods m
  where m.tenant_id = public.current_tenant_id()
  order by m.sort_order, m.name;
$$;

grant execute on function public.tartil_methods_list() to authenticated;

-- Generate baris materi (jilid) untuk satu metode: "Ummi Jilid 1..N".
-- Materi lama tidak pernah dihapus/dinonaktifkan — hanya menambah yang kurang.
create or replace function public.tartil_method_generate_jilids(p_method_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_method  public.tartil_methods;
  v_i       integer;
  v_created integer := 0;
  v_name    text;
  v_max_sort integer;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'ADMIN', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  select * into v_method from public.tartil_methods
  where id = p_method_id and tenant_id = v_tenant for update;
  if v_method is null then raise exception 'METODE_TIDAK_DITEMUKAN'; end if;

  select coalesce(max(sort_order), 0) + 100 into v_max_sort
  from public.tartil_materials where tenant_id = v_tenant;

  v_i := 1;
  while v_i <= v_method.jilid_count loop
    v_name := v_method.name || ' Jilid ' || v_i;
    if not exists (
      select 1 from public.tartil_materials m
      where m.tenant_id = v_tenant and lower(btrim(m.name)) = lower(v_name)
    ) then
      insert into public.tartil_materials (tenant_id, name, jilid, sort_order)
      values (v_tenant, v_name, v_i::text, v_max_sort + v_i);
      v_created := v_created + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  return v_created;
end;
$$;

grant execute on function public.tartil_method_generate_jilids(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: santri binaan guru + ringkasan tartil terakhir (UUID-first)
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_teacher_summaries(uuid);

create or replace function public.tartil_teacher_summaries(p_teacher_id uuid)
returns table (
  student_id       uuid,
  business_code    text,
  full_name        text,
  gender           public.gender_type,
  student_status   public.entity_status,
  assessed_count   bigint,
  last_material    text,
  last_pages       text,
  last_score_label text,
  last_score_value integer,
  last_mode        public.tahfidz_mode,
  last_assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_teacher uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role <> 'USTADZ' then raise exception 'AKSES_DITOLAK'; end if;

  -- Guru hanya boleh ringkasan miliknya sendiri (UUID dulu, fallback nama).
  v_teacher := public.current_teacher_id();
  if v_teacher is null then
    select t.id into v_teacher from public.teachers t
    where t.tenant_id = v_tenant
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc limit 1;
  end if;
  if v_teacher is null or v_teacher <> p_teacher_id then raise exception 'AKSES_DITOLAK'; end if;

  return query
  with binaan as (
    -- Jalur halaqah (utama) + teacher_students (data lama)
    select hs.student_id
    from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher
    union
    select ts.student_id
    from public.teacher_students ts
    where ts.teacher_id = v_teacher
  ),
  scored as (
    select a.student_id, count(*)::bigint as c
    from public.tartil_assessments a
    where a.deleted_at is null and a.status = 'DINILAI'
    group by a.student_id
  )
  select s.id, s.business_code, s.full_name, s.gender, s.status,
         coalesce(sc.c, 0),
         last_a.material_name, last_a.pages_label,
         last_a.score_label, last_a.score_value,
         case when last_a.score_label is not null then 'HURUF'::public.tahfidz_mode
              when last_a.score_value is not null then 'ANGKA'::public.tahfidz_mode
              else null end,
         last_a.assessed_at
  from binaan b
  join public.students s on s.id = b.student_id and s.tenant_id = v_tenant
  left join scored sc on sc.student_id = s.id
  left join lateral (
    select distinct on (a.student_id)
      a.assessed_at, a.pages_label, a.score_label, a.score_value, m.name as material_name
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    where a.student_id = s.id and a.deleted_at is null
    order by a.student_id, a.assessed_at desc
  ) last_a on true
  order by s.full_name;
end;
$$;

grant execute on function public.tartil_teacher_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Simpan penilaian jurnal (UUID-first + binaan halaqah ATAU teacher_students)
-- ---------------------------------------------------------------------------
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
    v_profile.tenant_id, p_student_id, p_material_id, v_teacher.id, v_uid, now(),
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

-- ---------------------------------------------------------------------------
-- 5. Riwayat satu santri untuk form/histori guru (UUID-first binaan check)
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_student_assessments(uuid);

create or replace function public.tartil_student_assessments(p_student_id uuid)
returns table (
  id            uuid,
  material_name text,
  pages_label   text,
  assessed_at   timestamptz,
  status        public.tahfidz_progress,
  score_value   integer,
  score_label   text,
  free_note     text,
  teacher_name  text,
  notes         jsonb,
  updated_at    timestamptz
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
  v_ok      boolean := false;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;

  if v_role in ('USTADZ') then
    -- Guru: harus binaan (halaqah atau teacher_students).
    select public.current_teacher_id() into v_ok;
    if v_ok is null then
      select t.id into v_ok from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc limit 1;
    end if;
    if v_ok is not null and exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_ok and hs.student_id = p_student_id
    ) then
      v_ok := true;
    elsif v_ok is not null and exists (
      select 1 from public.teacher_students ts
      where ts.teacher_id = v_ok and ts.student_id = p_student_id
    ) then
      v_ok := true;
    else
      v_ok := false;
    end if;
  elsif v_role in ('ADMIN', 'KOORDINATOR') then
    v_ok := exists (select 1 from public.students where id = p_student_id and tenant_id = v_tenant);
  elsif v_role = 'WALI_SANTRI' then
    v_ok := public.v11_is_wali_of(p_student_id);
  else
    v_ok := false;
  end if;

  if not v_ok then raise exception 'AKSES_DITOLAK'; end if;

  return query
  select
    a.id, m.name, a.pages_label, a.assessed_at, a.status,
    a.score_value, a.score_label, a.free_note, t.full_name,
    coalesce((
      select jsonb_object_agg(n.slot, n.content)
      from public.tartil_assessment_notes n where n.assessment_id = a.id
    ), '{}'::jsonb),
    a.updated_at
  from public.tartil_assessments a
  join public.tartil_materials m on m.id = a.material_id
  left join public.teachers t on t.id = a.teacher_id
  where a.student_id = p_student_id
    and a.tenant_id = v_tenant
    and a.deleted_at is null
  order by a.assessed_at desc
  limit 100;
end;
$$;

grant execute on function public.tartil_student_assessments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Template catatan: baca + kelola (guru pakai, admin kelola)
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_note_templates_list();

create or replace function public.tartil_note_templates_list()
returns table (
  id         uuid,
  slot       public.tartil_note_slot,
  content    text,
  sort_order integer,
  is_active  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.slot, t.content, t.sort_order, t.is_active
  from public.tartil_note_templates t
  where t.tenant_id = public.current_tenant_id()
  order by t.sort_order, t.created_at;
$$;

grant execute on function public.tartil_note_templates_list() to authenticated;

drop function if exists public.tartil_note_template_save(uuid, text, text, boolean);

create or replace function public.tartil_note_template_save(
  p_id      uuid,   -- null = baru
  p_slot    text,
  p_content text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'USTADZ', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_slot not in ('APRESIASI','BACAAN','FASHOHAH','SARAN','CATATAN_ORANG_TUA') then
    raise exception 'SLOT_CATATAN_TIDAK_VALID';
  end if;
  if btrim(p_content) = '' or char_length(btrim(p_content)) > 300 then
    raise exception 'ISI_TEMPLATE_TIDAK_VALID';
  end if;

  if p_id is null then
    insert into public.tartil_note_templates (tenant_id, slot, content, is_active)
    values (v_tenant, p_slot::public.tartil_note_slot, btrim(p_content), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.tartil_note_templates t
    set slot = p_slot::public.tartil_note_slot,
        content = btrim(p_content),
        is_active = coalesce(p_is_active, true)
    where t.id = p_id and t.tenant_id = v_tenant
    returning t.id into v_id;
    if v_id is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.tartil_note_template_save(uuid, text, text, boolean) to authenticated;

drop function if exists public.tartil_note_template_delete(uuid);

create or replace function public.tartil_note_template_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   text;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'USTADZ', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;
  delete from public.tartil_note_templates
  where id = p_id and tenant_id = v_tenant;
end;
$$;

grant execute on function public.tartil_note_template_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SINKRON DASBOR SANTRI — ringkasan tartil anak (wali)
-- ---------------------------------------------------------------------------
drop function if exists public.tartil_wali_summary();

create or replace function public.tartil_wali_summary()
returns table (
  student_id       uuid,
  student_name     text,
  last_material    text,
  last_pages_label text,
  last_score_label text,
  last_score_value integer,
  last_assessed_at timestamptz,
  teacher_name     text,
  note_apresiasi   text,
  count_dinilai    integer
)
language sql
stable
security definer
set search_path = public
as $$
  -- Hanya anak yang terhubung akun wali ini (guardian_students) di tenant-nya.
  with anak as (
    select gs.student_id
    from public.guardians g
    join public.guardian_students gs on gs.guardian_id = g.id
    where g.profile_id = auth.uid()
  )
  select
    s.id,
    s.full_name,
    last_a.material_name,
    last_a.pages_label,
    last_a.score_label,
    last_a.score_value,
    last_a.assessed_at,
    last_a.teacher_name,
    last_a.note_apresiasi,
    coalesce(cnt.c, 0)
  from anak an
  join public.students s on s.id = an.student_id
  left join lateral (
    select distinct on (a.student_id)
      a.assessed_at, a.pages_label, a.score_label, a.score_value,
      m.name as material_name, t.full_name as teacher_name,
      (select n.content from public.tartil_assessment_notes n
       where n.assessment_id = a.id and n.slot = 'APRESIASI' limit 1) as note_apresiasi
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    left join public.teachers t on t.id = a.teacher_id
    where a.student_id = s.id and a.deleted_at is null
    order by a.student_id, a.assessed_at desc
  ) last_a on true
  left join lateral (
    select count(*)::int as c
    from public.tartil_assessments a
    where a.student_id = s.id and a.deleted_at is null and a.status = 'DINILAI'
  ) cnt on true
  order by s.full_name;
$$;

grant execute on function public.tartil_wali_summary() to authenticated;
