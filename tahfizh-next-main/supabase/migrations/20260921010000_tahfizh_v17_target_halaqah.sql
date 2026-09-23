-- ============================================================================
-- TAHFIZH V17 — TARGET PER HALAQAH (menggantikan Target per santri V7)
-- ============================================================================
-- Perubahan:
--   1. Target lama (per santri, V7) DIHAPUS TOTAL: tabel `targets`,
--      `target_progress_history`, seluruh RPC `target_*`, enum `target_status`,
--      serta semua tempat yang membacanya (raport, timeline perkembangan,
--      ringkasan dashboard/santri).
--   2. Target baru diatur PER HALAQAH (bukan per santri), tepat 3 jenis:
--        TAHFIDZ (Tahfidz Al-Qur'an) · HADITS · DOA
--      Satu halaqah punya paling banyak satu target per jenis
--      (unique halaqah_id + category). Satuan mengikuti jenis:
--      TAHFIDZ = surat, HADITS = hadits, DOA = doa (dipetakan di aplikasi).
--
-- Tabel  : halaqah_targets
-- RPC    : target_halaqah_overview()   — halaqah yang diampu + target-nya
--          target_halaqah_save()       — buat / ubah target (upsert per jenis)
--          target_halaqah_clear()      — kosongkan target satu jenis
--          v7_teacher_counts()         — cabang TARGETS kini = target halaqah aktif
--          v7_student_summary()        — tanpa kolom target
--          report_student_data()       — tanpa blok target
-- View   : student_development_events  — tanpa event TARGET
--
-- Keamanan: SECURITY DEFINER + verifikasi session → role USTADZ → tenant →
-- halaqah yang diampu. Tulis hanya lewat RPC; RLS select tenant + role.
-- Idempoten: aman dijalankan ulang (file gabungan menjalankan ulang semua
-- migration berurutan; urutan di bawah membuat hasil akhirnya tetap sama).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel halaqah_targets
-- ----------------------------------------------------------------------------
create table if not exists public.halaqah_targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  halaqah_id    uuid not null references public.halaqahs (id) on delete cascade,
  category      text not null check (category in ('TAHFIDZ', 'HADITS', 'DOA')),
  target_value  integer not null check (target_value between 1 and 10000),
  start_date    date not null,
  end_date      date not null,
  description   text check (char_length(description) <= 300),
  teacher_id    uuid references public.teachers (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (halaqah_id, category),
  constraint halaqah_targets_period_check check (end_date >= start_date)
);

create index if not exists halaqah_targets_tenant_idx
  on public.halaqah_targets (tenant_id, end_date);

drop trigger if exists halaqah_targets_updated_at on public.halaqah_targets;
create trigger halaqah_targets_updated_at
  before update on public.halaqah_targets
  for each row execute function public.touch_updated_at();

alter table public.halaqah_targets enable row level security;

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists halaqah_targets_select on public.halaqah_targets;
create policy halaqah_targets_select on public.halaqah_targets
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.halaqah_teachers ht
            where ht.halaqah_id = halaqah_targets.halaqah_id
              and ht.teacher_id = public.halaqah_current_teacher()
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- ----------------------------------------------------------------------------
-- 2. RPC target_halaqah_overview — halaqah yang diampu guru + target-nya
-- ----------------------------------------------------------------------------
drop function if exists public.target_halaqah_overview();

create or replace function public.target_halaqah_overview()
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
  v_targets jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    return jsonb_build_object('halaqah', '[]'::jsonb, 'targets', '[]'::jsonb);
  end if;

  -- Halaqah aktif yang diampu guru + jumlah santri aktif yang masih tergabung.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'name', h.name,
             'studentCount', (
               select count(*) from public.halaqah_students hs
               join public.students s on s.id = hs.student_id
               where hs.halaqah_id = h.id and hs.left_at is null and s.status = 'ACTIVE'
             )
           ) order by h.name), '[]'::jsonb)
  into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id and ht.teacher_id = v_teacher
  where h.tenant_id = v_tenant
    and h.status = 'ACTIVE';

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', t.id,
             'halaqahId', t.halaqah_id,
             'category', t.category,
             'targetValue', t.target_value,
             'startDate', t.start_date,
             'endDate', t.end_date,
             'description', t.description,
             'updatedAt', t.updated_at
           ) order by t.category), '[]'::jsonb)
  into v_targets
  from public.halaqah_targets t
  where t.tenant_id = v_tenant
    and t.halaqah_id in (
      select ht.halaqah_id from public.halaqah_teachers ht where ht.teacher_id = v_teacher
    );

  return jsonb_build_object('halaqah', v_halaqah, 'targets', v_targets);
end;
$$;

grant execute on function public.target_halaqah_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC target_halaqah_save — buat / ubah target satu jenis untuk satu halaqah
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | KATEGORI_TIDAK_VALID |
--            TARGET_TIDAK_VALID | PERIODE_TIDAK_VALID |
--            DESKRIPSI_TERLALU_PANJANG | HALAQAH_TIDAK_VALID
-- ----------------------------------------------------------------------------
drop function if exists public.target_halaqah_save(uuid, text, integer, date, date, text);

create or replace function public.target_halaqah_save(
  p_halaqah_id   uuid,
  p_category     text,
  p_target_value integer,
  p_start_date   date,
  p_end_date     date,
  p_description  text default null
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
  v_halaqah uuid;
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  if p_category is null or p_category not in ('TAHFIDZ', 'HADITS', 'DOA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;
  if p_target_value is null or p_target_value < 1 or p_target_value > 10000 then
    raise exception 'TARGET_TIDAK_VALID';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or (p_end_date - p_start_date) > 1100 then
    raise exception 'PERIODE_TIDAK_VALID';
  end if;
  if v_desc is not null and char_length(v_desc) > 300 then
    raise exception 'DESKRIPSI_TERLALU_PANJANG';
  end if;

  select h.id into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id
  where h.id = p_halaqah_id
    and h.tenant_id = v_tenant
    and ht.teacher_id = v_teacher;
  if v_halaqah is null then
    raise exception 'HALAQAH_TIDAK_VALID';
  end if;

  insert into public.halaqah_targets (
    tenant_id, halaqah_id, category, target_value, start_date, end_date,
    description, teacher_id, created_by, updated_by
  ) values (
    v_tenant, v_halaqah, p_category, p_target_value, p_start_date, p_end_date,
    v_desc, v_teacher, v_uid, v_uid
  )
  on conflict (halaqah_id, category) do update set
    target_value = excluded.target_value,
    start_date   = excluded.start_date,
    end_date     = excluded.end_date,
    description  = excluded.description,
    teacher_id   = excluded.teacher_id,
    updated_by   = excluded.updated_by
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.target_halaqah_save(uuid, text, integer, date, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC target_halaqah_clear — kosongkan target satu jenis
--    Errors: AKSES_DITOLAK | GURU_TIDAK_DITEMUKAN | KATEGORI_TIDAK_VALID |
--            HALAQAH_TIDAK_VALID | TARGET_TIDAK_DITEMUKAN
-- ----------------------------------------------------------------------------
drop function if exists public.target_halaqah_clear(uuid, text);

create or replace function public.target_halaqah_clear(
  p_halaqah_id uuid,
  p_category   text
)
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
  v_halaqah uuid;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select p.tenant_id, p.role::text into v_tenant, v_role
  from public.profiles p where p.id = v_uid;

  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.halaqah_current_teacher();
  if v_teacher is null then
    raise exception 'GURU_TIDAK_DITEMUKAN';
  end if;

  if p_category is null or p_category not in ('TAHFIDZ', 'HADITS', 'DOA') then
    raise exception 'KATEGORI_TIDAK_VALID';
  end if;

  select h.id into v_halaqah
  from public.halaqahs h
  join public.halaqah_teachers ht on ht.halaqah_id = h.id
  where h.id = p_halaqah_id
    and h.tenant_id = v_tenant
    and ht.teacher_id = v_teacher;
  if v_halaqah is null then
    raise exception 'HALAQAH_TIDAK_VALID';
  end if;

  delete from public.halaqah_targets
  where halaqah_id = v_halaqah and category = p_category and tenant_id = v_tenant;
  if not found then
    raise exception 'TARGET_TIDAK_DITEMUKAN';
  end if;
end;
$$;

grant execute on function public.target_halaqah_clear(uuid, text) to authenticated;

-- ============================================================================
-- 5. HAPUS TOTAL TARGET LAMA (per santri, V7)
--    Urutan penting: pertama ganti SEMUA pembaca `targets` (view/fungsi),
--    baru buang fungsi, tabel, dan tipe — tanpa CASCADE.
-- ============================================================================

-- 5a. Dashboard guru: cabang TARGETS kini menghitung target halaqah yang
--     masih berlaku (end_date belum lewat) pada halaqah yang diampu guru.
create or replace function public.v7_teacher_counts(p_teacher_id uuid)
returns table (section text, cnt bigint)
language sql
security definer set search_path = public
as $$
  with session_teacher as (
    select t.id from public.teachers t
    where t.id = p_teacher_id
      and t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
      and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
  )
  select * from (
    select 'TARGETS'::text as section,
           count(*)::bigint as cnt
    from public.halaqah_targets ht2
    join public.halaqah_teachers hte on hte.halaqah_id = ht2.halaqah_id
    join session_teacher st on st.id = hte.teacher_id
    where ht2.end_date >= current_date
    union all
    select 'TASKS'::text,
           count(*)::bigint
    from public.tasks k, session_teacher st
    where k.teacher_id = st.id and k.deleted_at is null
      and k.status in ('BELUM_DIKERJAKAN', 'DIKERJAKAN', 'DIKUMPULKAN', 'TERLAMBAT')
    union all
    select 'JOURNALS'::text,
           count(*)::bigint
    from public.journal_entries e, session_teacher st
    where e.teacher_id = st.id and e.deleted_at is null
      and e.entry_date >= (current_date - interval '30 days')::date
  ) u;
$$;

-- 5b. Ringkasan santri: kolom target dibuang (bentuk return berubah → drop dulu).
drop function if exists public.v7_student_summary(uuid);

create or replace function public.v7_student_summary(p_student_id uuid)
returns table (
  active_tasks   integer,
  journal_month  integer
)
language sql
security definer set search_path = public
as $$
  select
    (select count(*)::integer from public.tasks k
      where k.student_id = p_student_id and k.tenant_id = public.current_tenant_id()
        and k.deleted_at is null
        and k.status in ('BELUM_DIKERJAKAN','DIKERJAKAN','DIKUMPULKAN','TERLAMBAT')),
    (select count(*)::integer from public.journal_entries e
      where e.student_id = p_student_id and e.tenant_id = public.current_tenant_id()
        and e.deleted_at is null
        and e.entry_date >= date_trunc('month', current_date)::date)
$$;

-- 5c. Raport: report_student_data tanpa blok TARGET (salinan V9 minus target).
create or replace function public.report_student_data(
  p_student_id  uuid,
  p_period_start date,
  p_period_end   date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_student public.students;
  v_teacher public.teachers;
  v_head    public.leader_profiles;
  v_settings public.report_settings;
  v_tsettings public.tenant_settings;
  v_mode    public.tahfidz_mode;
  v_payload jsonb;
  v_tahfidz jsonb;
  v_tartil  jsonb;
  v_setoran jsonb;
  v_hadits  jsonb;
  v_doa     jsonb;
  v_tajwid  jsonb;
  v_tugas   jsonb;
  v_jurnal  jsonb;
  v_attendance jsonb;
  v_in_period date := p_period_start;
  v_out_period date := p_period_end;
begin
  if v_tenant is null then raise exception 'AKSES_DITOLAK'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'PERIODE_TIDAK_VALID';
  end if;

  select * into v_student from public.students
  where id = p_student_id and tenant_id = v_tenant;
  if v_student is null then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

  select * into v_tsettings from public.tenant_settings where tenant_id = v_tenant;
  select * into v_settings from public.report_settings where tenant_id = v_tenant;
  v_mode := coalesce(public.tahfidz_settings_mode(v_tenant), 'CENTANG');

  -- TAHFIDZ (V3): surah rows + summary per V3 mode.
  v_tahfidz := (
    select jsonb_build_object(
      'count', count(*) filter (where a.status = 'DINILAI'),
      'avgValue', round(avg(a.score_value) filter (where a.status = 'DINILAI' and a.score_value is not null), 0),
      'lastLabel', (select a2.score_label from public.tahfidz_assessments a2
                    where a2.student_id = p_student_id and a2.status = 'DINILAI'
                    order by a2.assessed_at desc limit 1),
      'activeTotal', (select count(*) from public.tahfidz_tenant_surahs ts
                      where ts.tenant_id = v_tenant and ts.is_active),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
            'name', coalesce(ts2.name_override, gs.name, 'Surat'),
            'scoreLabel', a.score_label, 'scoreValue', a.score_value, 'status', a.status)
          order by ts2.sort_order)
        from public.tahfidz_assessments a
        join public.tahfidz_tenant_surahs ts2 on ts2.id = a.tenant_surah_id
        left join public.tahfidz_surahs gs on gs.id = ts2.surah_id
        where a.student_id = p_student_id and a.status = 'DINILAI'
      ), '[]'::jsonb)
    )
    from public.tahfidz_assessments a
    where a.student_id = p_student_id
  );

  -- TARTIL (V4)
  v_tartil := (
    select jsonb_build_object(
      'count', count(*),
      'avgValue', round(avg(a.score_value), 0),
      'lastLabel', (select a2.score_label from public.tartil_assessments a2
                    where a2.student_id = p_student_id and a2.deleted_at is null
                      and a2.status = 'DINILAI'
                    order by a2.assessed_at desc limit 1),
      'lastPages', (select a2.pages_label from public.tartil_assessments a2
                    where a2.student_id = p_student_id and a2.deleted_at is null
                    order by a2.assessed_at desc limit 1)
    )
    from public.tartil_assessments a
    where a.student_id = p_student_id and a.deleted_at is null
      and a.assessed_at::date between v_in_period and v_out_period
  );

  -- SETORAN (V5)
  v_setoran := (
    select jsonb_build_object(
      'total', count(*),
      'lulus', count(*) filter (where s.result = 'LULUS'),
      'ulang', count(*) filter (where s.result = 'PERLU_MENGULANG'),
      'lastKind', (select s2.kind::text from public.tahfidz_submissions s2
                   where s2.student_id = p_student_id and s2.deleted_at is null
                   order by s2.assessed_date desc limit 1)
    )
    from public.tahfidz_submissions s
    where s.student_id = p_student_id and s.deleted_at is null
      and s.assessed_date between v_in_period and v_out_period
  );

  -- HADITS / DOA / TAJWID (V6)
  v_hadits := (
    select jsonb_build_object(
      'count', count(*) filter (where a.status in ('LULUS','MENGUASAI')),
      'total', count(*),
      'avgValue', round(avg(a.score_value), 0),
      'lastLabel', (select a2.score_label from public.learning_assessments a2
                    where a2.student_id = p_student_id and a2.deleted_at is null
                      and a2.module_type = 'HADITS'
                    order by a2.assessed_date desc limit 1)
    )
    from public.learning_assessments a
    where a.student_id = p_student_id and a.deleted_at is null
      and a.module_type = 'HADITS'
      and a.assessed_date between v_in_period and v_out_period
  );

  v_doa := (
    select jsonb_build_object(
      'count', count(*) filter (where a.status in ('LULUS','MENGUASAI')),
      'total', count(*),
      'avgValue', round(avg(a.score_value), 0),
      'lastLabel', (select a2.score_label from public.learning_assessments a2
                    where a2.student_id = p_student_id and a2.deleted_at is null
                      and a2.module_type = 'DOA'
                    order by a2.assessed_date desc limit 1)
    )
    from public.learning_assessments a
    where a.student_id = p_student_id and a.deleted_at is null
      and a.module_type = 'DOA'
      and a.assessed_date between v_in_period and v_out_period
  );

  v_tajwid := (
    select jsonb_build_object(
      'count', count(*) filter (where a.status = 'MENGUASAI'),
      'total', count(*),
      'avgValue', round(avg(a.score_value), 0),
      'lastLabel', (select a2.score_label from public.learning_assessments a2
                    where a2.student_id = p_student_id and a2.deleted_at is null
                      and a2.module_type = 'TAJWID'
                    order by a2.assessed_date desc limit 1)
    )
    from public.learning_assessments a
    where a.student_id = p_student_id and a.deleted_at is null
      and a.module_type = 'TAJWID'
      and a.assessed_date between v_in_period and v_out_period
  );

  -- TUGAS (V7)
  v_tugas := (
    select jsonb_build_object(
      'total', count(*),
      'dinilai', count(*) filter (where k.status = 'DINILAI'),
      'avgValue', round(avg(k.score_value) filter (where k.status = 'DINILAI'), 0)
    )
    from public.tasks k
    where k.student_id = p_student_id and k.deleted_at is null
      and k.due_date between v_in_period and v_out_period
  );

  -- JURNAL (V7): jumlah entry bulan periode (untuk Kartu Prestasi ringkas).
  v_jurnal := (
    select coalesce(count(*), 0)
    from public.journal_entries e
    where e.student_id = p_student_id and e.deleted_at is null
      and e.entry_date between v_in_period and v_out_period
  );

  -- PRESENSI (V8): rekap H/I/S/A + persentase untuk periode raport.
  -- rpc dipanggil via helper SQL langsung (bukan nested RPC) agar payload
  -- tetap satu query terstruktur (rule #73).
  v_attendance := (
    select jsonb_build_object(
      'hadir', count(*) filter (where r.status = 'HADIR'),
      'izin', count(*) filter (where r.status = 'IZIN'),
      'sakit', count(*) filter (where r.status = 'SAKIT'),
      'alpa', count(*) filter (where r.status = 'ALPA'),
      'persen', coalesce(round(
        count(*) filter (where r.status = 'HADIR')::numeric / nullif(count(*), 0) * 100, 0), 0)
    )
    from public.attendance_records r
    where r.student_id = p_student_id
      and r.tenant_id = v_tenant
      and r.created_at::date between v_in_period and v_out_period
  );
  select * into v_head from public.leader_profiles where tenant_id = v_tenant;

  select * into v_teacher from public.teachers
  where tenant_id = v_tenant and id = (
    select ts.teacher_id from public.teacher_students ts
    where ts.student_id = p_student_id
    order by ts.created_at desc limit 1
  );

  v_payload := jsonb_build_object(
    'student', jsonb_build_object(
      'name', v_student.full_name,
      'id', v_student.business_code,
      'gender', v_student.gender
    ),
    'teacher', case when v_teacher is null then null else jsonb_build_object(
      'name', v_teacher.full_name,
      'id', case when coalesce(v_tsettings.show_teacher_identity, false)
                 then coalesce((select ti.value from public.teacher_identities ti
                                where ti.teacher_id = v_teacher.id
                                order by ti.identity_key limit 1), '')
                 else '' end,
      'identityLabel', coalesce((select t2 ->> 'label' from public.tenant_settings ts2,
                                 jsonb_array_elements(ts2.identity_types) t2
                                 where ts2.tenant_id = v_tenant limit 1), 'ID')
    ) end,
    'head', case when v_head is null then null else jsonb_build_object(
      'name', trim(coalesce(v_head.front_title, '') || ' ' || v_head.full_name
                   || case when coalesce(v_head.back_title, '') <> '' then ', ' || v_head.back_title else '' end),
      'id', coalesce(v_head.identity_number, ''),
      'identityLabel', coalesce(v_head.identity_key, 'ID')
    ) end,
    'institution', jsonb_build_object(
      'name', (select name from public.tenants where id = v_tenant),
      'code', (select business_code from public.tenants where id = v_tenant),
      'address', coalesce(v_settings.address, ''),
      'contact', coalesce(v_settings.contact, ''),
      'logoPath', v_settings.logo_path,
      'watermark', jsonb_build_object(
        'enabled', coalesce(v_settings.watermark_enabled, false),
        'opacity', coalesce(v_settings.watermark_opacity, 15),
        'scale', coalesce(v_settings.watermark_scale, 60),
        'path', v_settings.watermark_path
      ),
      'footer', coalesce(v_settings.footer_text, ''),
      'showPageNumbers', coalesce(v_settings.show_page_numbers, true)
    ),
    'mode', v_mode::text,
    'scores', jsonb_build_object(
      'tahfidz', v_tahfidz,
      'tartil', v_tartil,
      'setoran', v_setoran,
      'hadits', v_hadits,
      'doa', v_doa,
      'tajwid', v_tajwid,
      'tugas', v_tugas,
      'jurnal', v_jurnal
    ),
    'attendance', v_attendance,  -- V8 real data (rule #65: hideable in builder)
    'period', jsonb_build_object(
      'start', v_in_period,
      'end', v_out_period
    )
  );

  return v_payload;
end;
$$;


-- 5d. Timeline perkembangan santri: tanpa event TARGET (salinan V11 minus target).
create or replace view public.student_development_events
with (security_invoker = on) as  -- RLS of underlying tables applies (no bypass)
select s.tenant_id, s.student_id, s.assessed_at::date as event_date,
       'TAHFIDZ'::text as kind,
       coalesce(ts.name_override, q.name, 'Surah') as title,
       s.status::text as detail, t.full_name as teacher,
       s.score_label, s.assessed_at as created_at
from public.tahfidz_assessments s
left join public.tahfidz_tenant_surahs ts on ts.id = s.tenant_surah_id
left join public.tahfidz_surahs q on q.id = ts.surah_id
left join public.teachers t on t.id = s.teacher_id
union all
select s.tenant_id, s.student_id, s.assessed_date, 'SETORAN',
       coalesce(ts.name_override, q.name, 'Setoran'),
       case s.kind when 'MUROJAAH' then 'Murojaah' else 'Hafalan Baru' end
         || coalesce(' · ' || s.ayat_label, '') || ' · ' || s.result::text,
       t.full_name, s.score_label, s.created_at
from public.tahfidz_submissions s
left join public.tahfidz_tenant_surahs ts on ts.id = s.tenant_surah_id
left join public.tahfidz_surahs q on q.id = ts.surah_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assessed_at::date, 'TARTIL',
       coalesce(m.name, 'Tartil'), coalesce(s.pages_label, ''),
       t.full_name, s.score_label, s.created_at
from public.tartil_assessments s
left join public.tartil_materials m on m.id = s.material_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assessed_date, s.module_type::text,
       coalesce(
         (select h.title from public.hadith_materials h where h.id = s.hadith_id),
         (select p.title from public.daily_prayer_materials p where p.id = s.prayer_id),
         (select w.title from public.tajwid_materials w where w.id = s.tajwid_id),
         s.module_type::text),
       s.status::text, t.full_name, s.score_label, s.created_at
from public.learning_assessments s
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.assigned_date, 'TUGAS',
       s.title, s.status::text, t.full_name, s.score_label, s.created_at
from public.tasks s
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select s.tenant_id, s.student_id, s.entry_date, 'JURNAL',
       tm.name, coalesce(s.free_text, ''), t.full_name, null, s.created_at
from public.journal_entries s
left join public.journal_templates tm on tm.id = s.template_id
left join public.teachers t on t.id = s.teacher_id
where s.deleted_at is null
union all
select ar.tenant_id, ar.student_id, as2.session_date, 'PRESENSI',
       h.name, ar.status::text || coalesce(' · ' || ar.note, ''),
       null, null, ar.created_at
from public.attendance_records ar
join public.attendance_sessions as2 on as2.id = ar.session_id
join public.halaqahs h on h.id = ar.halaqah_id
union all
select s.tenant_id, s.student_id, s.effective_date, 'MUTASI',
       'Mutasi Halaqah',
       coalesce((select h.name from public.halaqahs h where h.id = s.to_halaqah_id), '') || coalesce(' · ' || s.reason, ''),
       (select t.full_name from public.teachers t where t.id = s.to_teacher_id),
       null, s.created_at
from public.student_transfers s
union all
select s.tenant_id, s.student_id, s.created_at::date, 'PROMOSI',
       'Kenaikan Level',
       coalesce(s.from_level || ' → ', '') || s.to_level,
       null, null, s.created_at
from public.student_promotions s
union all
select s.tenant_id, s.student_id, s.effective_date, 'STATUS',
       'Perubahan Status', s.to_status::text || coalesce(' · ' || s.reason, ''),
       null, null, s.created_at
from public.student_status_history s;


-- 5e. Template raport tersimpan: buang penanda modul "TARGET" pada komponen
--     SCORE_TABLE (murni penanda; renderer tidak lagi memuat modul ini).
update public.report_templates
set layout = replace(replace(layout::text, '"TARGET", ', ''), ', "TARGET"', '')::jsonb
where layout::text like '%"TARGET"%';

-- 5f. Buang fungsi, tabel, dan tipe target lama (tidak ada pembaca tersisa).
drop function if exists public.target_save(uuid, text, date, date, text, text, numeric, text, text, uuid);
drop function if exists public.target_recompute_progress(uuid, text);
drop function if exists public.target_recompute_status(uuid, text);
drop function if exists public.target_set_progress(uuid, numeric);
drop function if exists public.target_cancel(uuid);
drop function if exists public.target_teacher_list();
drop function if exists public.target_student_detail(uuid);
drop function if exists public.target_progress_history_list(uuid);

drop table if exists public.target_progress_history;
drop table if exists public.targets;

drop function if exists public.target_record_history();
drop type if exists public.target_status;
