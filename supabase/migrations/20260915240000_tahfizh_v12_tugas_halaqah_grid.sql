-- ============================================================================
-- TAHFIZH V12.8 — Tugas Halaqah (grid penilaian per tugas)
-- ============================================================================
-- Fitur: guru memberikan TUGAS untuk SEMUA santri di halaqah yang diampu.
-- Tampilan menu Tugas seperti grid: baris = santri halaqah, kolom = tugas,
-- sel = nilai dengan 3 mode pilihan guru (CENTANG / HURUF / ANGKA).
--
-- 1. Tabel tugas_halaqah      — satu baris per tugas (per halaqah lembaga).
-- 2. Tabel tugas_halaqah_scores — nilai per (tugas, santri); UNIK per pasangan.
-- 3. RPC tugas_halaqah_grid()    — data grid (tugas + santri + nilai tersimpan).
-- 4. RPC tugas_halaqah_create()  — guru membuat tugas (pilih halaqah yang diampu).
-- 5. RPC tugas_halaqah_save()    — simpan massal nilai (validasi per mode).
-- 6. RPC tugas_halaqah_delete()  — hapus tugas milik sendiri (soft delete).
--
-- Keamanan: SECURITY DEFINER + verifikasi session → role USTADZ/KOORDINATOR/ADMIN
-- → tenant → halaqah yang diampu (untuk USTADZ). Multi-tenant terisolasi.
-- Idempoten: drop sebelum create, create table if not exists, drop policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel tugas_halaqah
-- ---------------------------------------------------------------------------
create table if not exists public.tugas_halaqah (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  halaqah_id    uuid not null references public.halaqahs (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null,
  teacher_id    uuid references public.teachers (id) on delete set null,
  title         text not null check (char_length(title) between 1 and 120),
  description   text check (char_length(description) <= 500),
  assigned_date date not null default current_date,
  due_date      date not null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tugas_halaqah_dates_check check (due_date >= assigned_date)
);

create index if not exists tugas_halaqah_tenant_idx
  on public.tugas_halaqah (tenant_id, deleted_at);
create index if not exists tugas_halaqah_halaqah_idx
  on public.tugas_halaqah (halaqah_id) where deleted_at is null;

drop trigger if exists tugas_halaqah_updated_at on public.tugas_halaqah;
create trigger tugas_halaqah_updated_at
  before update on public.tugas_halaqah
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Tabel nilai per (tugas, santri)
-- ---------------------------------------------------------------------------
create table if not exists public.tugas_halaqah_scores (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  tugas_id      uuid not null references public.tugas_halaqah (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  mode          text not null default 'CENTANG'
                  check (mode in ('CENTANG', 'HURUF', 'ANGKA')),
  score_value   integer check (score_value between 1 and 100),
  score_label   text check (char_length(score_label) between 1 and 10),
  note          text check (char_length(note) <= 500),
  assessed_by   uuid references public.profiles (id) on delete set null,
  assessed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tugas_id, student_id),
  constraint tugas_score_mode_value_check check (
    (mode = 'CENTANG' and score_value is null and score_label in ('✓'))
    or (mode = 'ANGKA' and score_value is not null and score_label is null)
    or (mode = 'HURUF' and score_value is null and score_label is not null)
  )
);

create index if not exists tugas_halaqah_scores_tugas_idx
  on public.tugas_halaqah_scores (tugas_id);

drop trigger if exists tugas_halaqah_scores_updated_at on public.tugas_halaqah_scores;
create trigger tugas_halaqah_scores_updated_at
  before update on public.tugas_halaqah_scores
  for each row execute function public.touch_updated_at();

alter table public.tugas_halaqah        enable row level security;
alter table public.tugas_halaqah_scores enable row level security;

-- RLS: tenant + role (guru lihat binaannya via halaqah; admin/koordinator lembaga).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "tugas_halaqah select tenant" on public.tugas_halaqah;
drop policy if exists "tugas_halaqah_scores select tenant" on public.tugas_halaqah_scores;
create policy "tugas_halaqah select tenant"
  on public.tugas_halaqah for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.halaqah_teachers ht
          join public.teachers t on t.id = ht.teacher_id
          where ht.halaqah_id = tugas_halaqah.halaqah_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );
create policy "tugas_halaqah_scores select tenant"
  on public.tugas_halaqah_scores for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.halaqah_teachers ht
          join public.teachers t on t.id = ht.teacher_id
          join public.tugas_halaqah th on th.id = tugas_halaqah_scores.tugas_id
          where ht.halaqah_id = th.halaqah_id
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
create or replace function public.tugas_teacher_for_session()
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
-- 3. RPC tugas_halaqah_grid — data grid (halaqah yang diampu + tugas + nilai)
-- ---------------------------------------------------------------------------
drop function if exists public.tugas_halaqah_grid();

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

  -- Halaqah yang diampu guru (untuk dropdown Tambah Tugas & filter grid).
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.name), '[]'::jsonb)
  into v_halaqah
  from public.halaqahs h
  where h.tenant_id = v_tenant::uuid
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      where ht.halaqah_id = h.id and ht.teacher_id = v_teacher
    ));

  -- Tugas aktif (belum dihapus) milik tenant.
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

  -- Santri (binaan guru via halaqah / seluruh santri lembaga utk admin+koor).
  -- halaqahIds = halaqah aktif yang diikuti santri (sel grid hanya aktif bila
  -- santri anggota halaqah tugas tersebut).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.full_name,
      'nickname', s.nickname,
      'halaqahIds', coalesce((
        select jsonb_agg(hs.halaqah_id::text order by hs.halaqah_id)
        from public.halaqah_students hs
        where hs.student_id = s.id and hs.left_at is null
      ), '[]'::jsonb)
    ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant::uuid
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
      where ht.teacher_id = v_teacher and h1.student_id = s.id
    ));

  -- Nilai tersimpan per (tugas, santri).
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

-- ---------------------------------------------------------------------------
-- 4. RPC tugas_halaqah_create — guru membuat tugas untuk satu halaqah
-- ---------------------------------------------------------------------------
drop function if exists public.tugas_halaqah_create(text, uuid, date, date, text);

create or replace function public.tugas_halaqah_create(
  p_title       text,
  p_halaqah_id  uuid,
  p_due_date    date,
  p_assigned    date default current_date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_id      uuid;
  v_halaqah uuid;
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
  if p_due_date is null or p_assigned is null or p_due_date < p_assigned
     or p_assigned < (current_date - interval '1 year')::date
     or p_due_date > (current_date + interval '2 years')::date then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.tugas_teacher_for_session();
    if v_teacher is null then
      raise exception 'GURU_TIDAK_DITEMUKAN';
    end if;
    select h.id into v_halaqah
    from public.halaqahs h
    join public.halaqah_teachers ht on ht.halaqah_id = h.id
    where h.id = p_halaqah_id
      and h.tenant_id = v_tenant
      and ht.teacher_id = v_teacher;
  else
    select h.id into v_halaqah
    from public.halaqahs h
    where h.id = p_halaqah_id
      and h.tenant_id = v_tenant;
  end if;

  if v_halaqah is null then
    raise exception 'HALAQAH_TIDAK_VALID';
  end if;

  insert into public.tugas_halaqah
    (tenant_id, halaqah_id, created_by, teacher_id, title, description, assigned_date, due_date)
  values
    (v_tenant, v_halaqah, v_uid, v_teacher, btrim(p_title), p_description, p_assigned, p_due_date)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.tugas_halaqah_create(text, uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC tugas_halaqah_save — simpan massal nilai (validasi per mode)
-- ---------------------------------------------------------------------------
drop function if exists public.tugas_halaqah_save(jsonb);

create or replace function public.tugas_halaqah_save(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_item    jsonb;
  v_tugas   uuid;
  v_student uuid;
  v_mode    text;
  v_score   numeric;
  v_label   text;
  v_note    text;
  v_saved   integer := 0;
  v_check   uuid;
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
    v_teacher := public.tugas_teacher_for_session();
    if v_teacher is null then
      raise exception 'GURU_TIDAK_DITEMUKAN';
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 2000 then
    raise exception 'BATCH_TIDAK_VALID';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tugas   := nullif(v_item->>'tugasId', '')::uuid;
    v_student := nullif(v_item->>'studentId', '')::uuid;
    v_mode    := coalesce(nullif(v_item->>'mode', ''), 'CENTANG');
    v_score   := nullif(v_item->>'scoreValue', '')::numeric;
    v_label   := nullif(v_item->>'scoreLabel', '');
    v_note    := left(coalesce(v_item->>'note', ''), 500);

    if v_tugas is null or v_student is null then
      raise exception 'BATCH_TIDAK_VALID';
    end if;
    if v_mode not in ('CENTANG', 'HURUF', 'ANGKA') then
      raise exception 'MODE_TIDAK_VALID';
    end if;

    -- Tugas milik lembaga; guru wajib pengampu halaqah tugas.
    select th.id into v_check
    from public.tugas_halaqah th
    where th.id = v_tugas
      and th.tenant_id = v_tenant::uuid
      and th.deleted_at is null
      and (v_role <> 'USTADZ' or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = th.halaqah_id and ht.teacher_id = v_teacher
      ));
    if v_check is null then
      raise exception 'TUGAS_TIDAK_DITEMUKAN';
    end if;

    -- Santri satu tenant & aktif.
    select s.id into v_check
    from public.students s
    where s.id = v_student
      and s.tenant_id = v_tenant::uuid
      and s.status = 'ACTIVE';
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

    insert into public.tugas_halaqah_scores
      (tenant_id, tugas_id, student_id, mode, score_value, score_label, note, assessed_by, assessed_at)
    values
      (v_tenant::uuid, v_tugas, v_student, v_mode::text, v_score::int, v_label, nullif(v_note, ''), v_uid, now())
    on conflict (tugas_id, student_id) do update
      set mode        = excluded.mode,
          score_value = excluded.score_value,
          score_label = excluded.score_label,
          note        = excluded.note,
          assessed_by = excluded.assessed_by,
          assessed_at = now(),
          updated_at  = now();

    v_saved := v_saved + 1;
  end loop;

  return v_saved;
end;
$$;

grant execute on function public.tugas_halaqah_save(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC tugas_halaqah_delete — hapus tugas (soft delete, milik sendiri)
-- ---------------------------------------------------------------------------
drop function if exists public.tugas_halaqah_delete(uuid);

create or replace function public.tugas_halaqah_delete(p_tugas uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_teacher uuid;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.tugas_teacher_for_session();
    select th.id into v_id
    from public.tugas_halaqah th
    where th.id = p_tugas
      and th.tenant_id = v_tenant
      and th.deleted_at is null
      and (th.teacher_id = v_teacher or exists (
        select 1 from public.halaqah_teachers ht
        where ht.halaqah_id = th.halaqah_id and ht.teacher_id = v_teacher
      ));
  else
    select th.id into v_id
    from public.tugas_halaqah th
    where th.id = p_tugas
      and th.tenant_id = v_tenant
      and th.deleted_at is null;
  end if;

  if v_id is null then
    raise exception 'TUGAS_TIDAK_DITEMUKAN';
  end if;

  update public.tugas_halaqah
  set deleted_at = now()
  where id = v_id;
end;
$$;

grant execute on function public.tugas_halaqah_delete(uuid) to authenticated;
