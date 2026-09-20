-- ============================================================================
-- TAHFIZH V12 — "Santri binaan" = santri halaqah yang diampu guru
-- ============================================================================
-- Aturan baru (permintaan V12): TIDAK ADA penugasan santri manual per guru.
-- Guru mengampu santri MELALUI halaqah:
--   binaan(guru) = anggota aktif dari semua halaqah yang diampu guru tersebut.
-- Satu guru BOLEH mengampu lebih dari satu halaqah (halaqah_teachers memang
-- N:N), dan satu santri hanya aktif di satu halaqah pada satu waktu.
--
-- Implementasi: tabel lama `teacher_students` (penugasan manual V1) DIUBAH
-- menjadi VIEW dengan nama & kolom yang sama (id, tenant_id, teacher_id,
-- student_id, created_at). Seluruh modul pembelajaran (Tahfidz/Tartil/Setoran/
-- Hadits/Doa/Tajwid/Target/Tugas/Jurnal) yang membaca `teacher_students`
-- otomatis mengikuti aturan halaqah TANPA perubahan apa pun. View memakai
-- security_invoker=true sehingga RLS peran/tenant pengguna tetap berlaku penuh
-- (tidak ada bypass — aturan keamanan #60/#61 tetap terjaga).
--
-- Idempoten: aman dijalankan ulang.
-- ============================================================================

-- 0. Bersihkan SEMUA dependen `teacher_students` SEBELUM objeknya di-drop:
--    fungsi `language sql` dan policy RLS yang ekspresinya merujuk
--    `teacher_students` menjadi dependency Postgres, sehingga `drop view`
--    tanpa ini GAGAL (rerun), dan `drop table cascade` diam-diam MENGHAPUS
--    mereka (run pertama). Keduanya dibuat ulang di langkah 5.

drop function if exists public.tahfidz_teacher_summaries(uuid);
drop function if exists public.tartil_teacher_summaries(uuid);
drop function if exists public.tahfidz_teacher_submission_summaries(uuid);
drop function if exists public.learning_teacher_summaries(uuid, text);
drop function if exists public.report_teacher_list();
drop function if exists public.v10_teacher_whatsapp_directory();

drop policy if exists tahfidz_assessments_select on public.tahfidz_assessments;
drop policy if exists tahfidz_history_select on public.tahfidz_assessment_history;
drop policy if exists tartil_assessments_select on public.tartil_assessments;
drop policy if exists tartil_notes_select on public.tartil_assessment_notes;
drop policy if exists tartil_history_select on public.tartil_assessment_history;
drop policy if exists tahfidz_submissions_select on public.tahfidz_submissions;
drop policy if exists tahfidz_submission_notes_select on public.tahfidz_submission_notes;
drop policy if exists tahfidz_submission_history_select on public.tahfidz_submission_history;
drop policy if exists learning_assessments_select on public.learning_assessments;
drop policy if exists learning_notes_select on public.learning_assessment_notes;
drop policy if exists learning_history_select on public.learning_assessment_history;
drop policy if exists targets_select on public.targets;
drop policy if exists target_history_select on public.target_progress_history;
drop policy if exists tasks_select on public.tasks;
drop policy if exists task_history_select on public.task_status_history;
drop policy if exists journal_entries_select on public.journal_entries;
drop policy if exists journal_values_select on public.journal_values;
drop policy if exists journal_history_select on public.journal_entry_history;
drop policy if exists reports_select on public.reports;
drop policy if exists report_snapshots_select on public.report_snapshots;

-- 1. Hapus objek lama `teacher_students` apa pun bentuknya (tabel penugasan
--    manual V1, atau view sisa run ulang). Relasi manual lama ditiadakan
--    sesuai aturan baru — tidak ada data yang wajib dimigrasikan.
do $$
declare
  v_kind "char";
begin
  select c.relkind into v_kind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'teacher_students';
  if v_kind = 'r' then
    execute 'drop table public.teacher_students cascade';
  elsif v_kind = 'v' then
    execute 'drop view public.teacher_students';
  end if;
end $$;

-- 2. Buat ulang sebagai VIEW turunan halaqah.
create or replace view public.teacher_students with (security_invoker = true) as
select
  ht.tenant_id,
  ht.teacher_id,
  hs.student_id,
  -- id sintetis stabil per pasangan guru-santri (query lama hanya memakai
  -- `select id` untuk exists/count; tidak pernah untuk insert manual lagi).
  gen_random_uuid() as id,
  hs.joined_at as created_at
from public.halaqah_teachers ht
join public.halaqah_students hs
  on hs.halaqah_id = ht.halaqah_id
 and hs.left_at is null;
-- 3. Hak akses: session user tetap membaca lewat RLS tabel dasar
--    (halaqah_teachers & halaqah_students tenant-isolated). Revoke dari anon.
revoke all on public.teacher_students from anon;

-- 4. Index pendukung (idempoten).
create index if not exists halaqah_teachers_halaqah_idx on public.halaqah_teachers (halaqah_id);
create index if not exists halaqah_students_active_student_idx on public.halaqah_students (student_id) where left_at is null;

-- ============================================================================
-- 5. PULIHKAN DEPENDEN `teacher_students` (WAJIB — korban `drop ... cascade`)
-- ============================================================================
-- `drop table/view teacher_students` otomatis menghapus semua objek yang
-- ekspresinya merujuk `teacher_students`:
--   * 6 fungsi `language sql` (V3–V10): daftar ringkasan santri binaan guru
--     dan direktori WhatsApp guru — hilangnya = fitur guru rusak.
--   * 20 policy RLS SELECT (V3–V9) pada tabel Tahfidz/Tartil/Setoran/Hadits/
--     Doa/Tajwid/Target/Tugas/Jurnal/Raport — hilangnya = keamanan guru bocor.
-- Fungsi & policy ini DIBUAT ULANG di sini (setelah view ada) sehingga
-- menjalankan file ini satu kali pun sudah meninggalkan database yang utuh,
-- dan menjalankan ulang berkali-kali tetap aman (drop if exists / or replace).
-- ============================================================================

-- ---- 5a. Policy RLS SELECT yang merujuk view (identik dengan V3–V9) --------

drop policy if exists tahfidz_assessments_select on public.tahfidz_assessments;
create policy tahfidz_assessments_select on public.tahfidz_assessments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists tahfidz_history_select on public.tahfidz_assessment_history;
create policy tahfidz_history_select on public.tahfidz_assessment_history
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = tahfidz_assessment_history.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists tartil_assessments_select on public.tartil_assessments;
create policy tartil_assessments_select on public.tartil_assessments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = tartil_assessments.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists tartil_notes_select on public.tartil_assessment_notes;
create policy tartil_notes_select on public.tartil_assessment_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.tartil_assessments a
      where a.id = assessment_id
        and a.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = a.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists tartil_history_select on public.tartil_assessment_history;
create policy tartil_history_select on public.tartil_assessment_history
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('ADMIN', 'KOORDINATOR')
      or (
        public.current_role() = 'USTADZ'
        and exists (
          select 1 from public.teacher_students ts
          join public.teachers t on t.id = ts.teacher_id
          where ts.student_id = tartil_assessment_history.student_id
            and t.tenant_id = public.current_tenant_id()
            and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists tahfidz_submissions_select on public.tahfidz_submissions;
create policy tahfidz_submissions_select on public.tahfidz_submissions
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
            where ts.student_id = tahfidz_submissions.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists tahfidz_submission_notes_select on public.tahfidz_submission_notes;
create policy tahfidz_submission_notes_select on public.tahfidz_submission_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.tahfidz_submissions s
      where s.id = submission_id
        and s.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = s.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists tahfidz_submission_history_select on public.tahfidz_submission_history;
create policy tahfidz_submission_history_select on public.tahfidz_submission_history
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
            where ts.student_id = tahfidz_submission_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists learning_assessments_select on public.learning_assessments;
create policy learning_assessments_select on public.learning_assessments
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
            where ts.student_id = learning_assessments.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists learning_notes_select on public.learning_assessment_notes;
create policy learning_notes_select on public.learning_assessment_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.learning_assessments a
      where a.id = assessment_id
        and a.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = a.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists learning_history_select on public.learning_assessment_history;
create policy learning_history_select on public.learning_assessment_history
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
            where ts.student_id = learning_assessment_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists targets_select on public.targets;
create policy targets_select on public.targets
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
            where ts.student_id = targets.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists target_history_select on public.target_progress_history;
create policy target_history_select on public.target_progress_history
  for select to authenticated
  using (
    exists (
      select 1 from public.targets tg
      where tg.id = target_id
        and tg.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = tg.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
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
            where ts.student_id = tasks.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists task_history_select on public.task_status_history;
create policy task_history_select on public.task_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks k
      where k.id = task_id
        and k.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = k.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
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
            where ts.student_id = journal_entries.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

drop policy if exists journal_values_select on public.journal_values;
create policy journal_values_select on public.journal_values
  for select to authenticated
  using (
    exists (
      select 1 from public.journal_entries e
      where e.id = entry_id
        and e.tenant_id = public.current_tenant_id()
        and (
          public.current_role() in ('ADMIN', 'KOORDINATOR')
          or (
            public.current_role() = 'USTADZ'
            and exists (
              select 1 from public.teacher_students ts
              join public.teachers t on t.id = ts.teacher_id
              where ts.student_id = e.student_id
                and t.tenant_id = public.current_tenant_id()
                and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
            )
          )
        )
    )
    or public.is_platform_developer()
  );

drop policy if exists journal_history_select on public.journal_entry_history;
create policy journal_history_select on public.journal_entry_history
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
            where ts.student_id = journal_entry_history.student_id
              and t.tenant_id = public.current_tenant_id()
              and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
          )
        )
      )
    )
    or public.is_platform_developer()
  );

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

-- ---- 5b. Fungsi `language sql` yang merujuk view (identik dengan V3–V10) ----

create or replace function public.tahfidz_teacher_summaries(p_teacher_id uuid)
returns table (
  student_id         uuid,
  business_code      text,
  full_name          text,
  gender             public.gender_type,
  student_status     public.entity_status,
  scored_count       bigint,
  last_surah_name    text,
  last_score_label   text,
  last_score_value   integer,
  last_mode          public.tahfidz_mode,
  last_status        public.tahfidz_progress,
  last_assessed_at   timestamptz
)
language sql
security definer set search_path = public
as $$
  with assigned as (
    select s.id, s.business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  latest as (
    select distinct on (a.student_id)
      a.student_id, a.status, a.score_value, a.score_label,
      a.mode_at_entry_cache as mode, a.assessed_at,
      coalesce(ts.name_override, gs.name) as surah_name
    from public.tahfidz_assessments a
    join public.tahfidz_tenant_surahs ts on ts.id = a.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    where a.student_id in (select id from assigned)
      and a.status = 'DINILAI'
    order by a.student_id, a.assessed_at desc
  ),
  scored as (
    select student_id, count(*)::bigint as scored_count
    from public.tahfidz_assessments
    where student_id in (select id from assigned) and status = 'DINILAI'
    group by student_id
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(sc.scored_count, 0),
    l.surah_name, l.score_label, l.score_value, l.mode, l.status, l.assessed_at
  from assigned a
  left join latest l on l.student_id = a.id
  left join scored sc on sc.student_id = a.id
  order by a.full_name;
$$;

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
language sql
security definer set search_path = public
as $$
  with assigned as (
    select s.id, s.business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  latest as (
    select distinct on (a.student_id)
      a.student_id, a.pages_label, a.score_label, a.score_value,
      a.assessed_at,
      coalesce(m.pages_label, a.pages_label) as material_pages,
      m.name as material_name
    from public.tartil_assessments a
    join public.tartil_materials m on m.id = a.material_id
    where a.student_id in (select id from assigned)
      and a.deleted_at is null
      and a.status = 'DINILAI'
    order by a.student_id, a.assessed_at desc
  ),
  counts as (
    select student_id, count(*)::bigint as assessed_count
    from public.tartil_assessments
    where student_id in (select id from assigned) and deleted_at is null
    group by student_id
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(c.assessed_count, 0),
    l.material_name, l.pages_label, l.score_label, l.score_value,
    public.tahfidz_settings_mode((select tenant_id from public.teachers where id = p_teacher_id)),
    l.assessed_at
  from assigned a
  left join latest l on l.student_id = a.id
  left join counts c on c.student_id = a.id
  order by a.full_name;
$$;

create or replace function public.tahfidz_teacher_submission_summaries(p_teacher_id uuid)
returns table (
  student_id        uuid,
  business_code     text,
  full_name         text,
  gender            public.gender_type,
  student_status    public.entity_status,
  submission_count  bigint,
  lulus_count       bigint,
  last_surah        text,
  last_ayat         text,
  last_kind         public.submission_kind,
  last_result       public.submission_result,
  last_score_label  text,
  last_score_value  integer,
  last_date         date
)
language sql
security definer set search_path = public
as $$
  with assigned as (
    select s.id, s.business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  counts as (
    select
      sub.student_id,
      count(*) filter (where true)::bigint as submission_count,
      count(*) filter (where sub.result = 'LULUS')::bigint as lulus_count
    from public.tahfidz_submissions sub
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    group by sub.student_id
  ),
  latest as (
    select distinct on (sub.student_id)
      sub.student_id, sub.ayat_label, sub.kind, sub.result,
      sub.score_label, sub.score_value, sub.assessed_date,
      coalesce(ts.name_override, gs.name, 'Surat') as surah_name
    from public.tahfidz_submissions sub
    join public.tahfidz_tenant_surahs ts on ts.id = sub.tenant_surah_id
    left join public.tahfidz_surahs gs on gs.id = ts.surah_id
    where sub.student_id in (select id from assigned) and sub.deleted_at is null
    order by sub.student_id, sub.assessed_date desc, sub.created_at desc
  )
  select
    a.id, a.business_code, a.full_name, a.gender, a.status,
    coalesce(c.submission_count, 0),
    coalesce(c.lulus_count, 0),
    l.surah_name, l.ayat_label, l.kind, l.result, l.score_label, l.score_value, l.assessed_date
  from assigned a
  left join counts c on c.student_id = a.id
  left join latest l on l.student_id = a.id
  order by a.full_name;
$$;

create or replace function public.learning_teacher_summaries(
  p_teacher_id uuid,
  p_module     text
)
returns table (
  student_id      uuid,
  business_code   text,
  full_name       text,
  gender          public.gender_type,
  student_status  public.entity_status,
  assessed_count  bigint,
  lulus_count     bigint,
  last_material   text,
  last_status     public.learning_status,
  last_score_label text,
  last_score_value integer,
  last_date       date
)
language sql
security definer set search_path = public
as $$
  with assigned as (
    select s.id, s.business_code, s.full_name, s.gender, s.status
    from public.teacher_students ts
    join public.students s on s.id = ts.student_id
    where ts.teacher_id = p_teacher_id
      and ts.tenant_id = (select tenant_id from public.teachers where id = p_teacher_id)
      and (select role from public.profiles where id = auth.uid()) = 'USTADZ'
      and p_teacher_id = (
        select t.id from public.teachers t
        where t.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
          and t.full_name ilike (select full_name from public.profiles where id = auth.uid())
        order by t.created_at desc limit 1
      )
  ),
  counts as (
    select
      a.student_id,
      count(*) filter (where true)::bigint as assessed_count,
      count(*) filter (where a.status in ('LULUS', 'MENGUASAI'))::bigint as lulus_count
    from public.learning_assessments a
    where a.student_id in (select id from assigned)
      and a.module_type = p_module::public.learning_module
      and a.deleted_at is null
    group by a.student_id
  ),
  latest as (
    select distinct on (a.student_id)
      a.student_id, h.material_title, a.status, a.score_label, a.score_value, a.assessed_date
    from public.learning_assessments a
    join public.learning_assessment_history h
      on h.assessment_id = a.id and h.change_kind in ('CREATE', 'UPDATE')
    where a.student_id in (select id from assigned)
      and a.module_type = p_module::public.learning_module
      and a.deleted_at is null
    order by a.student_id, a.assessed_date desc, a.created_at desc
  )
  select
    s.id, s.business_code, s.full_name, s.gender, s.status,
    coalesce(c.assessed_count, 0),
    coalesce(c.lulus_count, 0),
    l.material_title, l.status, l.score_label, l.score_value, l.assessed_date
  from assigned s
  left join counts c on c.student_id = s.id
  left join latest l on l.student_id = s.id
  order by s.full_name;
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

create or replace function public.v10_teacher_whatsapp_directory()
returns table (
  student_id uuid, student_name text, student_code text,
  guardian_name text, guardian_whatsapp text
) language sql security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  my_teacher as (
    select t.id from public.teachers t
    where t.tenant_id = (select tenant_id from me)
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from me)))
    order by t.created_at desc limit 1
  )
  select s.id, s.full_name, s.business_code,
         (select p.full_name from public.guardian_students gs
            join public.guardians g on g.id = gs.guardian_id
            join public.profiles p on p.id = g.profile_id
          where gs.student_id = s.id order by gs.created_at limit 1),
         (select p.whatsapp from public.guardian_students gs
            join public.guardians g on g.id = gs.guardian_id
            join public.profiles p on p.id = g.profile_id
          where gs.student_id = s.id order by gs.created_at limit 1)
  from public.teacher_students ts
  join public.students s on s.id = ts.student_id and s.status = 'ACTIVE'
  where ts.teacher_id = (select id from my_teacher)
    and s.tenant_id = (select tenant_id from me)
  order by s.full_name
$$;

-- Hak akses fungsi yang sebelumnya diberi grant eksplisit di V10
-- (dibuat ulang karena fungsi ikut ter-drop oleh cascade).
grant execute on function public.v10_teacher_whatsapp_directory() to authenticated;
