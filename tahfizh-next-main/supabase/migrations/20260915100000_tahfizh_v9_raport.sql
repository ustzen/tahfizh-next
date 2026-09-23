-- ============================================================================
-- TAHFIZH V9 — MODUL RAPORT DINAMIS & REPORT BUILDER
-- New migration; does NOT alter V1–V8 tables destructively.
--
-- Architecture (rule #2/#68/#92): DEVELOPER TEMPLATE → TENANT TEMPLATE
-- → REPORT BUILDER → DATA PEMBELAJARAN (batch RPC) → PREVIEW → FINAL
-- SNAPSHOT → PRINT/PDF. "SATU DATA → BANYAK OUTPUT" (rule #29): scores are
-- never retyped; the report reads module data at preview time and freezes it
-- into a snapshot when finalized (rule #31/#67).
--
-- Layout model: report_templates.layout jsonb =
--   { paper, orientation, pages: [ { components: [ {id, type, x, y, w, h,
--      z, locked, hidden, style{}, props{}} ] } ] } — Developer can add new
--   component TYPES without schema changes (rule #14).
--
--   * report_templates        global (tenant_id null, DEVELOPER-owned) +
--                             tenant instances (rule #5: copies, never live
--                             references to global templates)
--   * report_template_versions  version history per template (rule #43)
--   * report_settings         tenant 1:1: logo, watermark, footer, address,
--                             contact (rule #19/#21/#24)
--   * reports                 per-student instances (DRAFT/FINAL, rule #32/#33)
--   * report_snapshots        immutable layout+data frozen at finalize
--
--   * RPCs: report_student_data (batch, rule #73), report_template_save,
--           report_template_duplicate, report_template_set_active,
--           report_template_delete, report_instantiate,
--           report_settings_save, report_create, report_finalize,
--           report_reopen, report_delete, list helpers
--   * Reuses V2 leader_profiles / tenant_settings / teacher_identities;
--     V3 scoring mode + grades; V4–V8 data sources.
--   * Presensi-aware: attendance binding returns NULL until V8 exists —
--     the renderer shows a placeholder instead of fake numbers.
--   * Full RLS (rule #45/#46); all writes via SECURITY DEFINER RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums (idempotent)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.report_status as enum ('DRAFT', 'FINAL');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 1. TEMPLATES — global (DEVELOPER) + tenant instances (ADMIN) (rule #3-#5)
-- ============================================================================
create table if not exists public.report_templates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid references public.tenants (id) on delete cascade, -- null = global DEVELOPER template
  created_by         uuid references public.profiles (id) on delete set null,
  source_template_id uuid references public.report_templates (id) on delete set null, -- provenance of tenant copies
  name               text not null check (char_length(name) between 1 and 120),
  description        text check (char_length(description) <= 300),
  paper              text not null default 'A4' check (paper in ('A4','A5','LETTER')),
  orientation        text not null default 'PORTRAIT' check (orientation in ('PORTRAIT','LANDSCAPE')),
  layout             jsonb not null default '{}'::jsonb,   -- pages/components model
  version            integer not null default 1,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists report_templates_tenant_idx
  on public.report_templates (tenant_id, is_active);
create index if not exists report_templates_source_idx
  on public.report_templates (source_template_id);

drop trigger if exists report_templates_updated_at on public.report_templates;
create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function public.touch_updated_at();

-- Version history (rule #43) — every save snapshots the previous layout.
create table if not exists public.report_template_versions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete cascade,
  template_id uuid not null references public.report_templates (id) on delete cascade,
  version     integer not null,
  layout      jsonb not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists report_versions_template_idx
  on public.report_template_versions (template_id, version desc);

-- ============================================================================
-- 2. REPORT SETTINGS — tenant 1:1 (rule #6/#17/#19/#21/#24)
-- ============================================================================
create table if not exists public.report_settings (
  tenant_id          uuid primary key references public.tenants (id) on delete cascade,
  logo_path          text,                                  -- storage path (report-assets bucket)
  address            text check (char_length(address) <= 300),
  contact            text check (char_length(contact) <= 200),
  footer_text        text check (char_length(footer_text) <= 200),
  show_page_numbers  boolean not null default true,
  watermark_enabled  boolean not null default false,
  watermark_opacity  integer not null default 15 check (watermark_opacity between 5 and 50),
  watermark_scale    integer not null default 60 check (watermark_scale between 10 and 100),
  watermark_path     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists report_settings_updated_at on public.report_settings;
create trigger report_settings_updated_at
  before update on public.report_settings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3. REPORTS — per santri instances (rule #30-#33)
-- ============================================================================
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  template_id     uuid not null references public.report_templates (id) on delete restrict,
  student_id      uuid not null references public.students (id) on delete cascade,
  teacher_id      uuid references public.teachers (id) on delete set null, -- wali kelas/guru penyusun
  created_by      uuid references public.profiles (id) on delete set null,
  title           text not null default 'RAPORT TAHFIZH' check (char_length(title) between 1 and 160),
  academic_year   text not null check (char_length(academic_year) between 4 and 20),  -- 2026/2027
  semester_label  text not null default 'Semester 1' check (char_length(semester_label) between 1 and 40),
  period_label    text check (char_length(period_label) <= 80),
  period_start    date not null,
  period_end      date not null,
  status          public.report_status not null default 'DRAFT',
  finalized_at    timestamptz,
  finalized_by    uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reports_period_check check (period_end >= period_start)
);

create index if not exists reports_tenant_idx on public.reports (tenant_id, status);
create index if not exists reports_student_idx on public.reports (student_id);
create index if not exists reports_template_idx on public.reports (template_id);

drop trigger if exists reports_updated_at on public.reports;
create trigger reports_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. SNAPSHOTS — immutable at finalize (rule #31/#67)
-- ============================================================================
create table if not exists public.report_snapshots (
  report_id   uuid primary key references public.reports (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  layout      jsonb not null,          -- frozen template layout
  data        jsonb not null,          -- frozen bound data (rule #73 payload)
  settings    jsonb not null default '{}'::jsonb, -- frozen logo/watermark/footer
  created_at  timestamptz not null default now()
);

create index if not exists report_snapshots_tenant_idx on public.report_snapshots (tenant_id);

-- ============================================================================
-- 5. RPC — BATCH STUDENT DATA (rule #28/#29/#73): one call, all modules.
--    Scoring display follows the V3 engine (rule #26/#27). Returns jsonb so
--    the renderer binds {{tokens}} without extra round trips.
-- ============================================================================
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
  v_target  jsonb;
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

  -- TARGET (V7): rata-rata progress % target yang relevan.
  v_target := (
    select jsonb_build_object(
      'active', count(*) filter (where tg.status in ('BELUM_MULAI','BERJALAN','TERLAMBAT')),
      'avgProgress', coalesce(round(avg(
        least(tg.current_value / nullif(tg.target_value, 0), 1) * 100
      ) filter (where tg.status in ('BELUM_MULAI','BERJALAN','TERLAMBAT'))), 0)
    )
    from public.targets tg
    where tg.student_id = p_student_id and tg.deleted_at is null
      and tg.end_date between v_in_period and v_out_period
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
      'target', v_target,
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

-- ============================================================================
-- 6. RPC — TEMPLATE MANAGEMENT (rule #4/#5/#42/#43; #47 server authorization)
--    Errors: AKSES_DITOLAK | TEMPLATE_TIDAK_DITEMUKAN | NAMA_TIDAK_VALID |
--            LAYOUT_TIDAK_VALID | TEMPLATE_DIGUNAKAN
-- ============================================================================

-- Shared layout validator: pages array of components with sane geometry.
create or replace function public.report_layout_valid(p_layout jsonb)
returns boolean
language sql
immutable
as $$
  select p_layout is not null
    and jsonb_typeof(p_layout) = 'object'
    and (p_layout -> 'pages') is not null
    and jsonb_typeof(p_layout -> 'pages') = 'array'
    and jsonb_array_length(p_layout -> 'pages') between 1 and 10
    and not exists (
      select 1
      from jsonb_array_elements(p_layout -> 'pages') pg
      where jsonb_typeof(pg -> 'components') <> 'array'
         or jsonb_array_length(pg -> 'components') > 60
         or exists (
           select 1 from jsonb_array_elements(pg -> 'components') c
           where coalesce(c ->> 'type', '') = ''
              or jsonb_typeof(c -> 'x') <> 'number' or jsonb_typeof(c -> 'y') <> 'number'
              or jsonb_typeof(c -> 'w') <> 'number' or jsonb_typeof(c -> 'h') <> 'number'
              or (c ->> 'x')::numeric < 0 or (c ->> 'y')::numeric < 0
              or (c ->> 'w')::numeric <= 0 or (c ->> 'h')::numeric <= 0
              or (c ->> 'x')::numeric > 1200 or (c ->> 'y')::numeric > 2000
              or (c ->> 'w')::numeric > 1200 or (c ->> 'h')::numeric > 2000
         )
    );
$$;

create or replace function public.report_template_save(
  p_template_id uuid default null,
  p_name        text default null,
  p_description text default null,
  p_paper       text default 'A4',
  p_orientation text default 'PORTRAIT',
  p_layout      jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_id      uuid;
  v_old     public.report_templates;
  v_is_dev  boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  v_is_dev := v_profile.role = 'DEVELOPER';

  if p_layout is not null and not public.report_layout_valid(p_layout) then
    raise exception 'LAYOUT_TIDAK_VALID';
  end if;
  if p_paper not in ('A4','A5','LETTER') or p_orientation not in ('PORTRAIT','LANDSCAPE') then
    raise exception 'LAYOUT_TIDAK_VALID';
  end if;

  if p_template_id is null then
    -- CREATE: DEVELOPER → global; ADMIN → own tenant instance.
    if not v_is_dev and v_profile.role <> 'ADMIN' then raise exception 'AKSES_DITOLAK'; end if;
    if p_name is null or char_length(trim(p_name)) not between 1 and 120 then
      raise exception 'NAMA_TIDAK_VALID';
    end if;

    insert into public.report_templates (
      tenant_id, created_by, name, description, paper, orientation, layout
    ) values (
      case when v_is_dev then null else v_profile.tenant_id end,
      auth.uid(), trim(p_name), p_description, p_paper, p_orientation,
      coalesce(p_layout, '{"pages":[{"components":[]}]}'::jsonb)
    ) returning id into v_id;

    insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
    values (case when v_is_dev then null else v_profile.tenant_id end,
            v_id, 1, coalesce(p_layout, '{"pages":[{"components":[]}]}'::jsonb), auth.uid(), 'Initial');
  else
    -- UPDATE: DEVELOPER edits global; ADMIN edits own tenant templates only.
    select * into v_old from public.report_templates where id = p_template_id;
    if v_old is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

    if v_old.tenant_id is null then
      if not v_is_dev then raise exception 'AKSES_DITOLAK'; end if;
    else
      if v_profile.role <> 'ADMIN' or v_old.tenant_id <> v_profile.tenant_id then
        raise exception 'AKSES_DITOLAK';
      end if;
    end if;

    -- Freeze previous version before overwriting (rule #43).
    insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
    values (v_old.tenant_id, v_old.id, v_old.version, v_old.layout, auth.uid(), 'Sebelum perubahan');

    update public.report_templates set
      name        = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      description = coalesce(p_description, description),
      paper       = p_paper,
      orientation = p_orientation,
      layout      = coalesce(p_layout, layout),
      version     = v_old.version + 1
    where id = v_old.id;

    if p_layout is not null then
      insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
      values (v_old.tenant_id, v_old.id, v_old.version + 1, p_layout, auth.uid(), 'Perubahan layout');
    end if;

    v_id := v_old.id;
  end if;

  return v_id;
end;
$$;

create or replace function public.report_template_duplicate(p_template_id uuid, p_new_name text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_src     public.report_templates;
  v_id      uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_src from public.report_templates where id = p_template_id;
  if v_src is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if v_src.tenant_id is null then
    -- DEVELOPER duplicates global; ADMIN instantiates a TENANT COPY (rule #5).
    if v_profile.role = 'DEVELOPER' then
      insert into public.report_templates (
        tenant_id, created_by, source_template_id, name, description,
        paper, orientation, layout, version
      ) values (
        null, auth.uid(), v_src.id,
        coalesce(p_new_name, v_src.name || ' (Salinan)'),
        v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
      ) returning id into v_id;
    elsif v_profile.role = 'ADMIN' and v_profile.tenant_id is not null then
      insert into public.report_templates (
        tenant_id, created_by, source_template_id, name, description,
        paper, orientation, layout, version
      ) values (
        v_profile.tenant_id, auth.uid(), v_src.id,
        coalesce(p_new_name, v_src.name),
        v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
      ) returning id into v_id;
    else raise exception 'AKSES_DITOLAK'; end if;
  else
    -- Tenant template duplicated within the same tenant only (rule #42/#45).
    if v_profile.role <> 'ADMIN' or v_src.tenant_id <> v_profile.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
    insert into public.report_templates (
      tenant_id, created_by, source_template_id, name, description,
      paper, orientation, layout, version
    ) values (
      v_profile.tenant_id, auth.uid(), v_src.id,
      coalesce(p_new_name, v_src.name || ' (Salinan)'),
      v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.report_template_set_active(p_template_id uuid, p_active boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.report_templates t set is_active = p_active
  where t.id = p_template_id
    and (
      (t.tenant_id is null and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER')
      or
      (t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
       and (select role from public.profiles where id = auth.uid()) = 'ADMIN')
    );
  if not found then raise exception 'AKSES_DITOLAK'; end if;
end;
$$;

-- Save ONLY the layout (builder [Simpan], rule #54/#55). Creates a new
-- version row so raport final lama tetap membaca snapshot-nya (rule #43).
create or replace function public.report_template_save_layout(
  p_template_id uuid,
  p_layout      jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_t       public.report_templates;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_t from public.report_templates where id = p_template_id;
  if v_t is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
  if not public.report_layout_valid(p_layout) then raise exception 'LAYOUT_TIDAK_VALID'; end if;

  if v_t.tenant_id is null then
    if v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  else
    if v_profile.role <> 'ADMIN' or v_profile.tenant_id is distinct from v_t.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
  end if;

  update public.report_templates
     set layout = p_layout,
         version = version + 1,
         updated_at = now()
   where id = p_template_id;

  insert into public.report_template_versions (template_id, version, layout, changed_by)
  values (p_template_id, v_t.version + 1, p_layout, auth.uid());
end;
$$;

-- Hard delete ONLY when unused by reports or tenant copies (rule: histori aman).
create or replace function public.report_template_delete(p_template_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_t       public.report_templates;
  v_used    boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_t from public.report_templates where id = p_template_id;
  if v_t is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if v_t.tenant_id is null then
    if v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
    select exists (
      select 1 from public.report_templates c where c.source_template_id = v_t.id
    ) or exists (
      select 1 from public.reports r join public.report_templates t2 on t2.id = r.template_id
      where t2.source_template_id = v_t.id
    ) into v_used;
  else
    if v_profile.role <> 'ADMIN' or v_t.tenant_id <> v_profile.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
    select exists (select 1 from public.reports r where r.template_id = v_t.id) into v_used;
  end if;

  if v_used then raise exception 'TEMPLATE_DIGUNAKAN'; end if;

  delete from public.report_templates where id = v_t.id;
end;
$$;

-- ============================================================================
-- 7. RPC — REPORT LIFECYCLE (rule #30-#34; #47)
-- ============================================================================
create or replace function public.report_create(
  p_template_id   uuid,
  p_student_id    uuid,
  p_title         text,
  p_academic_year text,
  p_semester      text,
  p_period_start  date,
  p_period_end    date,
  p_period_label  text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_tmpl    public.report_templates;
  v_id      uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Template must belong to THIS tenant (tenant copies, rule #5/#45).
  select * into v_tmpl from public.report_templates
  where id = p_template_id and tenant_id = v_profile.tenant_id and is_active;
  if v_tmpl is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if not exists (
    select 1 from public.students s where s.id = p_student_id and s.tenant_id = v_profile.tenant_id
  ) then raise exception 'SANTRI_TIDAK_DITEMUKAN'; end if;

  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'JUDUL_TIDAK_VALID';
  end if;
  if p_academic_year is null or char_length(trim(p_academic_year)) not between 4 and 20 then
    raise exception 'PERIODE_TIDAK_VALID';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'PERIODE_TIDAK_VALID';
  end if;

  insert into public.reports (
    tenant_id, template_id, student_id, created_by, title,
    academic_year, semester_label, period_label, period_start, period_end
  ) values (
    v_profile.tenant_id, v_tmpl.id, p_student_id, auth.uid(), trim(p_title),
    trim(p_academic_year), coalesce(p_semester, 'Semester 1'), p_period_label,
    p_period_start, p_period_end
  ) returning id into v_id;

  return v_id;
end;
$$;

-- FINAL: freeze layout + live data + settings into an immutable snapshot.
create or replace function public.report_finalize(p_report_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_r       public.reports;
  v_data    jsonb;
  v_layout  jsonb;
  v_settings jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' then raise exception 'AKSES_DITOLAK'; end if;

  select * into v_r from public.reports
  where id = p_report_id and tenant_id = v_profile.tenant_id;
  if v_r is null then raise exception 'RAPORT_TIDAK_DITEMUKAN'; end if;
  if v_r.status = 'FINAL' then raise exception 'RAPORT_SUDAH_FINAL'; end if;

  select layout into v_layout from public.report_templates where id = v_r.template_id;

  v_data := public.report_student_data(v_r.student_id, v_r.period_start, v_r.period_end);

  select to_jsonb(rs) - 'tenant_id' - 'created_at' - 'updated_at' into v_settings
  from public.report_settings rs where rs.tenant_id = v_profile.tenant_id;

  insert into public.report_snapshots (report_id, tenant_id, layout, data, settings)
  values (v_r.id, v_r.tenant_id, v_layout, v_data, coalesce(v_settings, '{}'::jsonb))
  on conflict (report_id) do update
    set layout = excluded.layout, data = excluded.data, settings = excluded.settings,
        created_at = now();

  update public.reports set
    status = 'FINAL', finalized_at = now(), finalized_by = auth.uid()
  where id = v_r.id;
end;
$$;

-- Reopen a FINAL report for revision (rule #33): back to DRAFT, snapshot kept
-- until the next finalize overwrites it — old final stays readable meanwhile.
create or replace function public.report_reopen(p_report_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.reports set status = 'DRAFT', finalized_at = null, finalized_by = null
  where id = p_report_id
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN';
  if not found then raise exception 'RAPORT_TIDAK_DITEMUKAN'; end if;
end;
$$;

create or replace function public.report_delete(p_report_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.reports
  where id = p_report_id
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and status = 'DRAFT'
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN';
  if not found then raise exception 'RAPORT_TIDAK_DITEMUKAN'; end if;
end;
$$;

-- ============================================================================
-- 8. RPC — LIST HELPERS (rule #49-#51)
-- ============================================================================
create or replace function public.report_admin_list(p_status text default 'ALL')
returns table (
  id             uuid,
  title          text,
  student_name   text,
  student_code   text,
  template_name  text,
  academic_year  text,
  semester_label text,
  period_label   text,
  period_start   date,
  period_end     date,
  status         public.report_status,
  finalized_at   timestamptz,
  updated_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select r.id, r.title, s.full_name, s.business_code,
         t.name, r.academic_year, r.semester_label, r.period_label,
         r.period_start, r.period_end, r.status, r.finalized_at, r.updated_at
  from public.reports r
  join public.students s on s.id = r.student_id
  join public.report_templates t on t.id = r.template_id
  where r.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) in ('ADMIN', 'KOORDINATOR')
    and (p_status = 'ALL' or r.status::text = p_status)
  order by r.updated_at desc
  limit 300;
$$;

create or replace function public.report_teacher_list()
returns table (
  id             uuid,
  title          text,
  student_name   text,
  student_code   text,
  academic_year  text,
  semester_label text,
  status         public.report_status,
  finalized_at   timestamptz
)
language sql
security definer set search_path = public
as $$
  select r.id, r.title, s.full_name, s.business_code,
         r.academic_year, r.semester_label, r.status, r.finalized_at
  from public.reports r
  join public.students s on s.id = r.student_id
  where r.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
    and exists (
      select 1 from public.teacher_students ts
      join public.teachers t on t.id = ts.teacher_id
      where ts.student_id = r.student_id
        and t.tenant_id = public.current_tenant_id()
        and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
    )
  order by r.updated_at desc
  limit 300;
$$;

-- Tenant templates + global catalog for the admin picker (rule #6).
create or replace function public.report_admin_templates()
returns table (
  id           uuid,
  scope        text,          -- TENANT | GLOBAL
  name         text,
  description  text,
  paper        text,
  orientation  text,
  version      integer,
  is_active    boolean,
  layout       jsonb,
  report_count bigint
)
language sql
security definer set search_path = public
as $$
  -- Tenant-owned templates (full detail).
  select t.id, 'TENANT'::text, t.name, t.description, t.paper, t.orientation,
         t.version, t.is_active, t.layout,
         (select count(*) from public.reports r where r.template_id = t.id)
  from public.report_templates t
  where t.tenant_id = public.current_tenant_id()
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'

  union all

  -- Global DEVELOPER catalog (metadata only; instantiation copies the layout).
  select g.id, 'GLOBAL'::text, g.name, g.description, g.paper, g.orientation,
         g.version, g.is_active, '{}'::jsonb, 0::bigint
  from public.report_templates g
  where g.tenant_id is null and g.is_active
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
  -- NOTE: `order by scope` fails with 42703 (scope is a reserved-ish keyword
  -- in ORDER BY context); order by output column position (scope, then name).
  order by 2 desc, 3;
$$;

-- DEVELOPER's own global templates (full layout for the builder).
create or replace function public.report_dev_templates()
returns table (
  id          uuid,
  name        text,
  description text,
  paper       text,
  orientation text,
  version     integer,
  is_active   boolean,
  layout      jsonb,
  copy_count  bigint
)
language sql
security definer set search_path = public
as $$
  select t.id, t.name, t.description, t.paper, t.orientation, t.version, t.is_active, t.layout,
         (select count(*) from public.report_templates c where c.source_template_id = t.id)
  from public.report_templates t
  where t.tenant_id is null
    and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER'
  order by t.name;
$$;

create or replace function public.report_template_detail(p_template_id uuid)
returns table (
  id          uuid,
  tenant_id   uuid,
  name        text,
  description text,
  paper       text,
  orientation text,
  version     integer,
  is_active   boolean,
  layout      jsonb
)
language sql
security definer set search_path = public
as $$
  select t.id, t.tenant_id, t.name, t.description, t.paper, t.orientation,
         t.version, t.is_active, t.layout
  from public.report_templates t
  where t.id = p_template_id
    and (
      (t.tenant_id is null and (select role from public.profiles where id = auth.uid()) = 'DEVELOPER')
      or
      (t.tenant_id = public.current_tenant_id()
       and (select role from public.profiles where id = auth.uid()) in ('ADMIN'))
    );
$$;

create or replace function public.report_settings_get()
returns jsonb
language sql
security definer set search_path = public
as $$
  select coalesce(to_jsonb(rs) - 'tenant_id' - 'created_at' - 'updated_at', '{}'::jsonb)
  from public.report_settings rs
  where rs.tenant_id = public.current_tenant_id();
$$;

create or replace function public.report_settings_save(
  p_address           text default null,
  p_contact           text default null,
  p_footer_text       text default null,
  p_show_page_numbers boolean default null,
  p_watermark_enabled boolean default null,
  p_watermark_opacity integer default null,
  p_watermark_scale   integer default null,
  p_logo_path         text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'ADMIN' or v_profile.tenant_id is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  insert into public.report_settings (tenant_id, address, contact, footer_text, show_page_numbers,
                                      watermark_enabled, watermark_opacity, watermark_scale, logo_path)
  values (
    v_profile.tenant_id,
    left(coalesce(p_address, ''), 300), left(coalesce(p_contact, ''), 200),
    left(coalesce(p_footer_text, ''), 200), coalesce(p_show_page_numbers, true),
    coalesce(p_watermark_enabled, false),
    greatest(5, least(coalesce(p_watermark_opacity, 15), 50)),
    greatest(10, least(coalesce(p_watermark_scale, 60), 100)),
    p_logo_path
  )
  on conflict (tenant_id) do update set
    address            = coalesce(excluded.address, report_settings.address),
    contact            = coalesce(excluded.contact, report_settings.contact),
    footer_text        = coalesce(excluded.footer_text, report_settings.footer_text),
    show_page_numbers  = coalesce(excluded.show_page_numbers, report_settings.show_page_numbers),
    watermark_enabled  = coalesce(excluded.watermark_enabled, report_settings.watermark_enabled),
    watermark_opacity  = coalesce(excluded.watermark_opacity, report_settings.watermark_opacity),
    watermark_scale    = coalesce(excluded.watermark_scale, report_settings.watermark_scale),
    logo_path          = coalesce(excluded.logo_path, report_settings.logo_path);
end;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (rule #45/#46)
-- ============================================================================
alter table public.report_templates         enable row level security;
alter table public.report_template_versions enable row level security;
alter table public.report_settings          enable row level security;
alter table public.reports                  enable row level security;
alter table public.report_snapshots         enable row level security;

-- Templates: global rows readable by everyone authenticated; tenant rows only
-- inside the tenant. Writes ONLY via RPCs (no direct client writes).
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates
  for select to authenticated
  using (
    tenant_id is null
    or tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists report_versions_select on public.report_template_versions;
create policy report_versions_select on public.report_template_versions
  for select to authenticated
  using (
    tenant_id is null
    or tenant_id = public.current_tenant_id()
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists report_settings_select on public.report_settings;
create policy report_settings_select on public.report_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform_developer());

-- Reports: Admin/Koordinator see the tenant; guru only their own students;
-- wali none in V9 (rule #48). Writes only via RPCs.
-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.teacher_students ts
            join public.teachers t on t.id = ts.teacher_id
            where ts.student_id = reports.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists report_snapshots_select on public.report_snapshots;
create policy report_snapshots_select on public.report_snapshots
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('ADMIN', 'KOORDINATOR')
        or (
          public.current_role() = 'USTADZ'
          and exists (
            select 1 from public.reports r
            join public.teacher_students ts on ts.student_id = r.student_id
            join public.teachers t on t.id = ts.teacher_id
            where r.id = report_snapshots.report_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

-- ============================================================================
-- 10. SEED — 3 DEVELOPER TEMPLATES (rule #3): 1 kolom, 2 kolom, fleksibel.
--     Canvas = A4 portrait at 96dpi: 794 × 1123 px. Grid snap 8px.
-- ============================================================================
insert into public.report_templates (tenant_id, name, description, paper, orientation, layout)
select null, 'Raport 1 Kolom', 'Template awal satu kolom: identitas → nilai → catatan → tanda tangan.',
'A4', 'PORTRAIT',
'{
  "pages": [
    {
      "components": [
        {"id":"c-logo","type":"LOGO","x":48,"y":40,"w":96,"h":96,"z":1,"locked":false,"hidden":false,"style":{},"props":{}},
        {"id":"c-inst","type":"INSTITUTION_NAME","x":176,"y":48,"w":560,"h":40,"z":2,"locked":false,"hidden":false,"style":{"fontSize":18,"bold":true,"align":"left"},"props":{}},
        {"id":"c-addr","type":"INSTITUTION_ADDRESS","x":176,"y":88,"w":560,"h":32,"z":3,"locked":false,"hidden":false,"style":{"fontSize":11,"align":"left"},"props":{}},
        {"id":"c-title","type":"REPORT_TITLE","x":48,"y":176,"w":698,"h":44,"z":4,"locked":false,"hidden":false,"style":{"fontSize":20,"bold":true,"align":"center"},"props":{}},
        {"id":"c-period","type":"PERIOD","x":48,"y":224,"w":698,"h":28,"z":5,"locked":false,"hidden":false,"style":{"fontSize":12,"align":"center"},"props":{}},
        {"id":"c-identity","type":"STUDENT_IDENTITY","x":48,"y":280,"w":698,"h":104,"z":6,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"fields":["name","id","class","halaqah"]}},
        {"id":"c-scores","type":"SCORE_TABLE","x":48,"y":408,"w":698,"h":260,"z":7,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"modules":["TAHFIDZ","TARTIL","SETORAN","HADITS","DOA","TAJWID","TARGET","TUGAS"]}},
        {"id":"c-notes","type":"NOTES","x":48,"y":696,"w":698,"h":120,"z":8,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"label":"Catatan"}},
        {"id":"c-sign","type":"SIGNATURES","x":48,"y":872,"w":698,"h":140,"z":9,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"left":"teacher","right":"head"}},
        {"id":"c-footer","type":"FOOTER","x":48,"y":1056,"w":698,"h":32,"z":10,"locked":false,"hidden":false,"style":{"fontSize":9,"align":"center"},"props":{}}
      ]
    }
  ]
}'::jsonb
where not exists (select 1 from public.report_templates where tenant_id is null and name = 'Raport 1 Kolom');

insert into public.report_templates (tenant_id, name, description, paper, orientation, layout)
select null, 'Raport 2 Kolom', 'Template awal dua kolom: kiri identitas & nilai, kanan catatan & prestasi.',
'A4', 'PORTRAIT',
'{
  "pages": [
    {
      "components": [
        {"id":"c-logo","type":"LOGO","x":48,"y":40,"w":88,"h":88,"z":1,"locked":false,"hidden":false,"style":{},"props":{}},
        {"id":"c-inst","type":"INSTITUTION_NAME","x":168,"y":48,"w":400,"h":36,"z":2,"locked":false,"hidden":false,"style":{"fontSize":17,"bold":true,"align":"left"},"props":{}},
        {"id":"c-addr","type":"INSTITUTION_ADDRESS","x":168,"y":86,"w":400,"h":28,"z":3,"locked":false,"hidden":false,"style":{"fontSize":10,"align":"left"},"props":{}},
        {"id":"c-title","type":"REPORT_TITLE","x":48,"y":168,"w":698,"h":40,"z":4,"locked":false,"hidden":false,"style":{"fontSize":18,"bold":true,"align":"center"},"props":{}},
        {"id":"c-identity","type":"STUDENT_IDENTITY","x":48,"y":232,"w":336,"h":128,"z":5,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{"fields":["name","id","class","halaqah"]}},
        {"id":"c-scores","type":"SCORE_TABLE","x":48,"y":384,"w":336,"h":380,"z":6,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{"modules":["TAHFIDZ","TARTIL","SETORAN","HADITS","DOA","TAJWID"]}},
        {"id":"c-ach","type":"ACHIEVEMENT_SUMMARY","x":416,"y":232,"w":330,"h":176,"z":7,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{}},
        {"id":"c-notes","type":"NOTES","x":416,"y":432,"w":330,"h":200,"z":8,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{"label":"Catatan"}},
        {"id":"c-att","type":"ATTENDANCE","x":416,"y":656,"w":330,"h":108,"z":9,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{}},
        {"id":"c-sign","type":"SIGNATURES","x":48,"y":920,"w":698,"h":132,"z":10,"locked":false,"hidden":false,"style":{"fontSize":11},"props":{"left":"teacher","right":"head"}},
        {"id":"c-footer","type":"FOOTER","x":48,"y":1056,"w":698,"h":32,"z":11,"locked":false,"hidden":false,"style":{"fontSize":9,"align":"center"},"props":{}}
      ]
    }
  ]
}'::jsonb
where not exists (select 1 from public.report_templates where tenant_id is null and name = 'Raport 2 Kolom');

insert into public.report_templates (tenant_id, name, description, paper, orientation, layout)
select null, 'Raport Fleksibel (2 Halaman)', 'Contoh kemampuan Report Builder: halaman 1 identitas & nilai, halaman 2 catatan, prestasi & tanda tangan.',
'A4', 'PORTRAIT',
'{
  "pages": [
    {
      "components": [
        {"id":"c-logo","type":"LOGO","x":48,"y":40,"w":104,"h":104,"z":1,"locked":false,"hidden":false,"style":{},"props":{}},
        {"id":"c-inst","type":"INSTITUTION_NAME","x":184,"y":56,"w":552,"h":40,"z":2,"locked":false,"hidden":false,"style":{"fontSize":20,"bold":true,"align":"left"},"props":{}},
        {"id":"c-addr","type":"INSTITUTION_ADDRESS","x":184,"y":100,"w":552,"h":32,"z":3,"locked":false,"hidden":false,"style":{"fontSize":11,"align":"left"},"props":{}},
        {"id":"c-contact","type":"INSTITUTION_CONTACT","x":184,"y":132,"w":552,"h":24,"z":4,"locked":false,"hidden":false,"style":{"fontSize":10,"align":"left"},"props":{}},
        {"id":"c-title","type":"REPORT_TITLE","x":48,"y":192,"w":698,"h":44,"z":5,"locked":false,"hidden":false,"style":{"fontSize":22,"bold":true,"align":"center"},"props":{}},
        {"id":"c-acayear","type":"ACADEMIC_YEAR","x":48,"y":240,"w":698,"h":26,"z":6,"locked":false,"hidden":false,"style":{"fontSize":12,"align":"center"},"props":{}},
        {"id":"c-identity","type":"STUDENT_IDENTITY","x":48,"y":296,"w":340,"h":128,"z":7,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"fields":["name","id","class","halaqah"]}},
        {"id":"c-teacher","type":"TEACHER_IDENTITY","x":416,"y":296,"w":330,"h":96,"z":8,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"showId":true}},
        {"id":"c-scores","type":"SCORE_TABLE","x":48,"y":448,"w":698,"h":330,"z":9,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"modules":["TAHFIDZ","TARTIL","SETORAN","HADITS","DOA","TAJWID","TARGET","TUGAS"]}},
        {"id":"c-footer","type":"FOOTER","x":48,"y":1056,"w":698,"h":32,"z":10,"locked":false,"hidden":false,"style":{"fontSize":9,"align":"center"},"props":{}}
      ]
    },
    {
      "components": [
        {"id":"c2-title","type":"CUSTOM_TEXT","x":48,"y":56,"w":698,"h":36,"z":1,"locked":false,"hidden":false,"style":{"fontSize":16,"bold":true,"align":"center"},"props":{"text":"Lampiran Raport"}},
        {"id":"c2-att","type":"ATTENDANCE","x":48,"y":112,"w":336,"h":120,"z":2,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{}},
        {"id":"c2-ach","type":"ACHIEVEMENT_SUMMARY","x":416,"y":112,"w":330,"h":160,"z":3,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{}},
        {"id":"c2-notes","type":"NOTES","x":48,"y":256,"w":698,"h":200,"z":4,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"label":"Catatan & Saran"}},
        {"id":"c2-sign","type":"SIGNATURES","x":48,"y":520,"w":698,"h":140,"z":5,"locked":false,"hidden":false,"style":{"fontSize":12},"props":{"left":"teacher","right":"head"}},
        {"id":"c2-head","type":"HEAD_IDENTITY","x":416,"y":672,"w":330,"h":72,"z":6,"locked":false,"hidden":false,"style":{"fontSize":12,"align":"center"},"props":{"showId":true}},
        {"id":"c2-footer","type":"FOOTER","x":48,"y":1056,"w":698,"h":32,"z":7,"locked":false,"hidden":false,"style":{"fontSize":9,"align":"center"},"props":{}}
      ]
    }
  ]
}'::jsonb
where not exists (select 1 from public.report_templates where tenant_id is null and name = 'Raport Fleksibel (2 Halaman)');

-- ============================================================================
-- 9. STORAGE — report-assets bucket (logo & watermark; rule #19/#45/#69)
--    Private, tenant-namespaced paths: {tenant_id}/logo.{ext} — Tenant A can
--    never read Tenant B's assets (same pattern as profile-photos in V2).
--    Upload cap (2 MB) & MIME types enforced app-side (actions/report.ts).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('report-assets', 'report-assets', false)
on conflict (id) do nothing;

-- Repair-safe: drop before create (create policy is not idempotent).
drop policy if exists "report assets read tenant" on storage.objects;
drop policy if exists "report assets write tenant admin" on storage.objects;
drop policy if exists "report assets update tenant admin" on storage.objects;
drop policy if exists "report assets delete tenant admin" on storage.objects;

create policy "report assets read tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-assets'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "report assets write tenant admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-assets'
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "report assets update tenant admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'report-assets'
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );

create policy "report assets delete tenant admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-assets'
    and (select role from public.profiles where id = auth.uid()) = 'ADMIN'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
  );
