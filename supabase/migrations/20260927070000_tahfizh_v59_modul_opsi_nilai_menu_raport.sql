-- ============================================================================
-- TAHFIZH V59 — Modul kustom: opsi penilaian, menu tersendiri, masuk raport
-- ============================================================================
-- Lanjutan V58. Tiap modul kustom kini punya 3 opsi lembaga:
--   • graded       — dicatat dengan nilai (0–100) selain hitungan poin.
--   • show_as_menu — tampil sebagai menu tersendiri di dasbor santri
--                    (/santri/modul/[id]) selain tile ringkas.
--   • in_raport    — ikut dicetak di Tabel Nilai raport.
-- Saat mengedit raport, komponen SCORE_TABLE punya pilihan modul kustom mana
-- saja yang masuk (props.customModules = id modul terpilih).
--
-- Idempoten: ALTER ... IF NOT EXISTS + drop/create ulang RPC.
-- ============================================================================

-- ----------------------------------------------------------------- columns --
alter table public.custom_modules
  add column if not exists graded boolean not null default false;
alter table public.custom_modules
  add column if not exists show_as_menu boolean not null default false;
alter table public.custom_modules
  add column if not exists in_raport boolean not null default false;

-- Nilai opsional per catatan poin (modul graded).
alter table public.custom_module_logs
  add column if not exists score_value numeric(5,2)
  check (score_value is null or (score_value >= 0 and score_value <= 100));
alter table public.custom_module_logs
  add column if not exists score_label text;

create index if not exists custom_module_logs_student_date_idx
  on public.custom_module_logs (student_id, log_date);

-- -------------------------------------------------------------------- RPCs --
drop function if exists public.custom_module_list(boolean);

create or replace function public.custom_module_list(p_all boolean default false)
returns table (
  id uuid, label text, icon text, tone text, poin_target integer, sort_order integer,
  is_active boolean, graded boolean, show_as_menu boolean, in_raport boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.label, m.icon, m.tone, m.poin_target, m.sort_order,
         m.is_active, m.graded, m.show_as_menu, m.in_raport
  from public.custom_modules m
  where m.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (p_all or m.is_active)
  order by m.sort_order, m.label;
$$;

grant execute on function public.custom_module_list(boolean) to authenticated;

drop function if exists public.custom_module_save(uuid, text, text, text, integer, integer);

-- p_id wajib dikirim (NULL = tambah baru) — parameter berdefault harus di akhir.
create or replace function public.custom_module_save(
  p_id           uuid,
  p_label        text,
  p_icon         text default 'star',
  p_tone         text default 'emerald',
  p_poin_target  integer default 0,
  p_sort         integer default 100,
  p_graded       boolean default false,
  p_show_as_menu boolean default false,
  p_in_raport    boolean default false
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
  v_label  text;
  v_icon   text;
  v_tone   text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('ADMIN', 'KOORDINATOR') then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if v_label is null or char_length(v_label) < 2 or char_length(v_label) > 40 then
    raise exception 'LABEL_TIDAK_VALID';
  end if;

  v_icon := nullif(btrim(coalesce(p_icon, '')), '');
  v_icon := coalesce(v_icon, 'star');
  if char_length(v_icon) > 24 then raise exception 'LABEL_TIDAK_VALID'; end if;

  v_tone := coalesce(nullif(btrim(coalesce(p_tone, '')), ''), 'emerald');
  if v_tone not in ('emerald', 'blue', 'sky', 'violet', 'amber', 'orange', 'rose', 'teal', 'cyan', 'indigo') then
    v_tone := 'emerald';
  end if;

  if coalesce(p_poin_target, 0) < 0 or coalesce(p_poin_target, 0) > 10000 then
    raise exception 'LABEL_TIDAK_VALID';
  end if;

  if p_id is null then
    insert into public.custom_modules
      (tenant_id, label, icon, tone, poin_target, sort_order, graded, show_as_menu, in_raport)
    values
      (v_tenant, v_label, v_icon, v_tone, coalesce(p_poin_target, 0), coalesce(p_sort, 100),
       coalesce(p_graded, false), coalesce(p_show_as_menu, false), coalesce(p_in_raport, false))
    returning id into v_id;
  else
    update public.custom_modules m
    set label = v_label, icon = v_icon, tone = v_tone,
        poin_target = coalesce(p_poin_target, 0), sort_order = coalesce(p_sort, 100),
        graded = coalesce(p_graded, false),
        show_as_menu = coalesce(p_show_as_menu, false),
        in_raport = coalesce(p_in_raport, false),
        updated_at = now()
    where m.id = p_id and m.tenant_id = v_tenant
    returning m.id into v_id;
    if v_id is null then raise exception 'MODUL_TIDAK_DITEMUKAN'; end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.custom_module_save(uuid, text, text, text, integer, integer, boolean, boolean, boolean) to authenticated;

-- Catat 1 poin (+ nilai opsional untuk modul graded).
drop function if exists public.custom_module_log_save(uuid, uuid, date, text);

create or replace function public.custom_module_log_save(
  p_student_id  uuid,
  p_module_id   uuid,
  p_log_date    date,
  p_note        text default null,
  p_score_value numeric default null,
  p_score_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_role     text;
  v_teacher  uuid;
  v_ok       boolean;
  v_graded   boolean;
  v_score    numeric;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN', 'WALI_SANTRI') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Modul harus milik lembaga ini dan aktif.
  select m.graded into v_graded
  from public.custom_modules m
  where m.id = p_module_id and m.tenant_id = v_tenant and m.is_active;
  if v_graded is null then raise exception 'MODUL_TIDAK_DITEMUKAN'; end if;

  -- Cakupan santri.
  if v_role = 'WALI_SANTRI' then
    select exists (
      select 1 from public.guardian_students gs
      join public.guardians g on g.id = gs.guardian_id
      where g.profile_id = v_uid and gs.student_id = p_student_id
    ) into v_ok;
    if not v_ok then raise exception 'SANTRI_TIDAK_VALID'; end if;
  elsif v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then raise exception 'AKSES_DITOLAK'; end if;
    select exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
      where ht.teacher_id = v_teacher and hs.student_id = p_student_id
    ) into v_ok;
    if not v_ok then raise exception 'SANTRI_TIDAK_VALID'; end if;
  else
    if not exists (
      select 1 from public.students s
      where s.id = p_student_id and s.tenant_id = v_tenant
    ) then raise exception 'SANTRI_TIDAK_VALID'; end if;
  end if;

  if p_log_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'TANGGAL_FUTUR';
  end if;

  -- Nilai hanya valid untuk modul graded, rentang 0–100.
  v_score := nullif(btrim(p_score_value::text), '')::numeric;
  if v_score is not null then
    if not v_graded then
      v_score := null; -- modul non-graded: nilai diabaikan
    elsif v_score < 0 or v_score > 100 then
      raise exception 'NILAI_TIDAK_VALID';
    end if;
  end if;

  insert into public.custom_module_logs (tenant_id, module_id, student_id, log_date, note, recorded_by, score_value, score_label)
  values (v_tenant, p_module_id, p_student_id, p_log_date,
          nullif(btrim(coalesce(p_note, '')), ''), v_uid,
          v_score, nullif(btrim(coalesce(p_score_label, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.custom_module_log_save(uuid, uuid, date, text, numeric, text) to authenticated;

drop function if exists public.custom_module_log_page(integer);

-- Riwayat catatan terbaru untuk guru/admin/koordinator.
create or replace function public.custom_module_log_page(p_limit integer default 50)
returns table (
  id uuid, module_id uuid, module_label text, student_id uuid,
  student_name text, log_date date, note text, created_at timestamptz,
  score_value numeric, score_label text, graded boolean
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
  if v_uid is null then raise exception 'AKSES_DITOLAK'; end if;
  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;
  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then return; end if;
  end if;

  return query
    select l.id, l.module_id, m.label, l.student_id, s.full_name,
           l.log_date, l.note, l.created_at, l.score_value, l.score_label, m.graded
    from public.custom_module_logs l
    join public.custom_modules m on m.id = l.module_id
    join public.students s on s.id = l.student_id
    where l.tenant_id = v_tenant
      and (v_role <> 'USTADZ' or exists (
        select 1 from public.halaqah_teachers ht
        join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
        where ht.teacher_id = v_teacher and hs.student_id = l.student_id
      ))
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.custom_module_log_page(integer) to authenticated;

-- V59 — Riwayat seluruh catatan poin anak milik akun wali ini (ops. filter
-- modul & batas jumlah). Dipakai menu tersendiri modul di dasbor santri.
drop function if exists public.custom_module_child_logs(uuid, integer);

create or replace function public.custom_module_child_logs(
  p_module_id uuid default null,
  p_limit     integer default 100
)
returns table (
  id uuid, module_id uuid, module_label text, student_id uuid,
  student_name text, log_date date, note text, created_at timestamptz,
  score_value numeric, score_label text, graded boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.module_id, m.label, l.student_id, s.full_name,
         l.log_date, l.note, l.created_at, l.score_value, l.score_label, m.graded
  from public.custom_module_logs l
  join public.custom_modules m on m.id = l.module_id
  join public.students s on s.id = l.student_id
  join public.guardian_students gs on gs.student_id = l.student_id
  join public.guardians g on g.id = gs.guardian_id
  where g.profile_id = auth.uid()
    and l.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and (p_module_id is null or l.module_id = p_module_id)
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;

grant execute on function public.custom_module_child_logs(uuid, integer) to authenticated;

-- Blok raport: ringkasan nilai modul kustom (graded + in_raport) per santri
-- dalam periode — dipakai report_student_data untuk Tabel Nilai.
drop function if exists public.custom_module_raport_data(uuid, date, date);

create or replace function public.custom_module_raport_data(
  p_student_id   uuid,
  p_period_start date,
  p_period_end   date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', m.id, 'label', m.label, 'count', t.cnt, 'avgValue', round(t.avg_value, 0))
      order by m.sort_order, m.label
    ),
    '[]'::jsonb
  )
  from (
    select l.module_id, count(*)::int as cnt, avg(l.score_value) as avg_value
    from public.custom_module_logs l
    join public.custom_modules mm on mm.id = l.module_id
    where l.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
      and l.student_id = p_student_id
      and mm.in_raport
      and mm.graded
      and l.score_value is not null
      and l.log_date between p_period_start and p_period_end
    group by l.module_id
  ) t
  join public.custom_modules m on m.id = t.module_id;
$$;

grant execute on function public.custom_module_raport_data(uuid, date, date) to authenticated;

-- ------------------------------------------------------ report_student_data --
-- Salinan V17 + blok 'custom' (modul kustom graded+in_raport) di scores.
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
                    order by a2.assessed_at desc limit 1)
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
      'jurnal', v_jurnal,
      -- V59 — modul kustom lembaga (graded + in_raport) dalam periode.
      'custom', public.custom_module_raport_data(p_student_id, v_in_period, v_out_period)
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
