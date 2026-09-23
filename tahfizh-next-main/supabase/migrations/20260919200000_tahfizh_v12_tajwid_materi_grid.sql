-- ============================================================================
-- TAHFIZH V12.9 — Tajwid Materi (grid penilaian per materi)
-- ============================================================================
-- Fitur: menu Tajwid sama seperti menu Tugas. Guru (dan koordinator/admin)
-- menambahkan MATERI tajwid lembaga (mis. Mad, Dengung, Iqlab…), lalu
-- menilai penguasaan tiap santri binaan di grid — 3 mode pilihan (CENTANG /
-- HURUF / ANGKA) yang bisa diganti kapan saja di menu.
--
-- 1. Tabel tajwid_materi        — materi tajwid lembaga (tenant-wide).
-- 2. Tabel tajwid_materi_scores — penguasaan per (materi, santri).
-- 3. RPC tajwid_materi_grid()   — data grid (materi + santri + nilai).
-- 4. RPC tajwid_materi_create() — tambah materi (judul + deskripsi opsional).
-- 5. RPC tajwid_materi_save()   — simpan massal nilai (validasi per mode).
-- 6. RPC tajwid_materi_delete() — hapus materi (soft delete).
--
-- Keamanan: SECURITY DEFINER + verifikasi session → role USTADZ/KOORDINATOR/
-- ADMIN → tenant → (USTADZ hanya santri binaan halaqah). Multi-tenant aman.
-- Idempoten: drop sebelum create, create table if not exists, drop policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel tajwid_materi
-- ---------------------------------------------------------------------------
create table if not exists public.tajwid_materi (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tajwid_materi_tenant_idx
  on public.tajwid_materi (tenant_id, deleted_at);

drop trigger if exists tajwid_materi_updated_at on public.tajwid_materi;
create trigger tajwid_materi_updated_at
  before update on public.tajwid_materi
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Tabel penguasaan per (materi, santri)
-- ---------------------------------------------------------------------------
create table if not exists public.tajwid_materi_scores (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  materi_id   uuid not null references public.tajwid_materi (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  mode        text not null default 'CENTANG'
                check (mode in ('CENTANG', 'HURUF', 'ANGKA')),
  score_value integer check (score_value between 1 and 100),
  score_label text check (char_length(score_label) between 1 and 10),
  assessed_by uuid references public.profiles (id) on delete set null,
  assessed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (materi_id, student_id),
  constraint tajwid_materi_score_mode_check check (
    (mode = 'CENTANG' and score_value is null and score_label in ('✓'))
    or (mode = 'ANGKA' and score_value is not null and score_label is null)
    or (mode = 'HURUF' and score_value is null and score_label is not null)
  )
);

create index if not exists tajwid_materi_scores_materi_idx
  on public.tajwid_materi_scores (materi_id);
create index if not exists tajwid_materi_scores_student_idx
  on public.tajwid_materi_scores (student_id);

drop trigger if exists tajwid_materi_scores_updated_at on public.tajwid_materi_scores;
create trigger tajwid_materi_scores_updated_at
  before update on public.tajwid_materi_scores
  for each row execute function public.touch_updated_at();

alter table public.tajwid_materi        enable row level security;
alter table public.tajwid_materi_scores enable row level security;

-- RLS: materi = topik bersama tenant (semua role lembaga boleh lihat).
drop policy if exists "tajwid_materi select tenant" on public.tajwid_materi;
create policy "tajwid_materi select tenant"
  on public.tajwid_materi for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('ADMIN', 'KOORDINATOR', 'USTADZ')
    or public.is_platform_developer()
  );

-- RLS nilai: admin/koordinator lembaga; guru hanya santri binaannya.
drop policy if exists "tajwid_materi_scores select tenant" on public.tajwid_materi_scores;
create policy "tajwid_materi_scores select tenant"
  on public.tajwid_materi_scores for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1
          from public.halaqah_teachers ht
          join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
          join public.teachers t on t.id = ht.teacher_id
          where ht.halaqah_id in (select ht2.halaqah_id from public.halaqah_teachers ht2 where ht2.teacher_id = t.id)
            and hs.student_id = tajwid_materi_scores.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

-- ---------------------------------------------------------------------------
-- Helper: teacher_id guru dari session (pola modul lain).
-- ---------------------------------------------------------------------------
create or replace function public.tajwid_teacher_for_session()
returns uuid
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
  if v_uid is null then return null; end if;
  select tenant_id, role into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null then return null; end if;
  if v_role in ('ADMIN', 'KOORDINATOR') then return null; end if;

  select t.id into v_teacher
  from public.teachers t
  where t.tenant_id = v_tenant
    and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
  order by t.created_at desc
  limit 1;
  return v_teacher;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC tajwid_materi_grid — data grid (materi + santri binaan + nilai)
-- ---------------------------------------------------------------------------
drop function if exists public.tajwid_materi_grid();

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

  -- Materi aktif lembaga (urut terbaru dulu seperti kolom tugas).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'title', m.title,
           'description', m.description
         ) order by m.created_at desc, m.id), '[]'::jsonb)
  into v_materi
  from public.tajwid_materi m
  where m.tenant_id = v_tenant::uuid
    and m.deleted_at is null;

  -- Santri: binaan guru via halaqah / seluruh santri aktif utk admin+koor.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.full_name,
      'nickname', s.nickname
    ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant::uuid
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher and hs.student_id = s.id
    ));

  -- Nilai tersimpan per (materi, santri).
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

  return jsonb_build_object(
    'materi', v_materi,
    'students', v_students,
    'scores', v_scores
  );
end;
$$;

grant execute on function public.tajwid_materi_grid() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC tajwid_materi_create — tambah materi tajwid lembaga
-- ---------------------------------------------------------------------------
drop function if exists public.tajwid_materi_create(text, text);

create or replace function public.tajwid_materi_create(
  p_title       text,
  p_description text default null
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
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'JUDUL_TIDAK_VALID';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'DESKRIPSI_TERLALU_PANJANG';
  end if;

  insert into public.tajwid_materi (tenant_id, created_by, title, description)
  values (v_tenant, v_uid, btrim(p_title), nullif(p_description, ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.tajwid_materi_create(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC tajwid_materi_save — simpan massal penguasaan (validasi per mode)
-- ---------------------------------------------------------------------------
drop function if exists public.tajwid_materi_save(jsonb);

create or replace function public.tajwid_materi_save(p_items jsonb)
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
  v_materi   uuid;
  v_student  uuid;
  v_mode     text;
  v_score    numeric;
  v_label    text;
  v_saved    integer := 0;
  v_check    uuid;
  v_grade_ok boolean;
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
      raise exception 'GURU_TIDAK_DITEMUKAN';
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 2000 then
    raise exception 'BATCH_TIDAK_VALID';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_materi  := nullif(v_item->>'materiId', '')::uuid;
    v_student := nullif(v_item->>'studentId', '')::uuid;
    v_mode    := coalesce(nullif(v_item->>'mode', ''), 'CENTANG');
    v_score   := nullif(v_item->>'scoreValue', '')::numeric;
    v_label   := nullif(v_item->>'scoreLabel', '');

    if v_materi is null or v_student is null then
      raise exception 'BATCH_TIDAK_VALID';
    end if;
    if v_mode not in ('CENTANG', 'HURUF', 'ANGKA') then
      raise exception 'MODE_TIDAK_VALID';
    end if;

    -- Materi milik lembaga & aktif.
    select m.id into v_check
    from public.tajwid_materi m
    where m.id = v_materi
      and m.tenant_id = v_tenant::uuid
      and m.deleted_at is null;
    if v_check is null then
      raise exception 'MATERI_TIDAK_DITEMUKAN';
    end if;

    -- Santri satu tenant & aktif; guru wajib pengampu halaqah santri.
    select s.id into v_check
    from public.students s
    where s.id = v_student
      and s.tenant_id = v_tenant::uuid
      and s.status = 'ACTIVE'
      and (v_role <> 'USTADZ' or exists (
        select 1 from public.halaqah_teachers ht
        join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
        where ht.teacher_id = v_teacher and hs.student_id = s.id
      ));
    if v_check is null then
      raise exception 'SANTRI_TIDAK_VALID';
    end if;

    -- Validasi nilai sesuai mode.
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

    insert into public.tajwid_materi_scores
      (tenant_id, materi_id, student_id, mode, score_value, score_label, assessed_by, assessed_at)
    values
      (v_tenant::uuid, v_materi, v_student, v_mode::text, v_score::int, v_label, v_uid, now())
    on conflict (materi_id, student_id) do update
      set mode        = excluded.mode,
          score_value = excluded.score_value,
          score_label = excluded.score_label,
          assessed_by = excluded.assessed_by,
          assessed_at = now(),
          updated_at  = now();

    v_saved := v_saved + 1;
  end loop;

  return v_saved;
end;
$$;

grant execute on function public.tajwid_materi_save(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC tajwid_materi_delete — hapus materi (soft delete)
-- ---------------------------------------------------------------------------
drop function if exists public.tajwid_materi_delete(uuid);

create or replace function public.tajwid_materi_delete(p_materi uuid)
returns void
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
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  select m.id into v_id
  from public.tajwid_materi m
  where m.id = p_materi
    and m.tenant_id = v_tenant
    and m.deleted_at is null;

  if v_id is null then
    raise exception 'MATERI_TIDAK_DITEMUKAN';
  end if;

  update public.tajwid_materi
  set deleted_at = now()
  where id = v_id;
end;
$$;

grant execute on function public.tajwid_materi_delete(uuid) to authenticated;
