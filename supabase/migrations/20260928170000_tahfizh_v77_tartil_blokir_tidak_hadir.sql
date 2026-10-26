-- ============================================================================
-- TAHFIZH V77 — TARTIL: santri TIDAK HADIR (izin/sakit/alpa) tidak bisa dinilai
-- ============================================================================
-- Aturan: bila presensi halaqah pada tanggal tertentu mencatat santri IZIN /
-- SAKIT / ALPA (dan tidak ada catatan HADIR pada tanggal yang sama), maka
-- penilaian Tartil untuk santri itu pada tanggal tersebut DITOLAK.
--
--   1. RPC `tartil_absences_on_date(p_date)` — daftar santri binaan guru yang
--      tidak hadir pada tanggal itu (untuk menampilkan keterangan di form).
--   2. Trigger `tartil_assessments_guard_absence` — penegak di database:
--      INSERT / UPDATE penilaian oleh GURU ditolak dengan
--      'SANTRI_TIDAK_HADIR:<STATUS>'. Berlaku untuk form massal maupun per
--      santri (keduanya lewat tabel yang sama). Soft-delete & perubahan lain
--      yang bukan nilai/tanggal tidak terpengaruh. Admin/proses sistem
--      (bukan USTADZ) tidak dibatasi.
--
-- Tanpa presensi pada tanggal itu = tidak ada pembatasan. Tidak ada perubahan
-- skema tabel. Idempoten.
-- ============================================================================

-- 1. RPC daftar tidak hadir ---------------------------------------------------
drop function if exists public.tartil_absences_on_date(date);

create or replace function public.tartil_absences_on_date(p_date date)
returns table (
  student_id uuid,
  status     text,
  note       text
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
  v_name    text;
  v_teacher uuid;
begin
  select p.tenant_id, p.role::text, p.full_name into v_tenant, v_role, v_name
  from public.profiles p where p.id = v_uid;
  if v_tenant is null or v_role <> 'USTADZ' then
    raise exception 'AKSES_DITOLAK';
  end if;

  select t.id into v_teacher from public.teachers t
    where t.tenant_id = v_tenant and t.profile_id = v_uid
    order by t.created_at desc limit 1;
  if v_teacher is null then
    select t.id into v_teacher from public.teachers t
      where t.tenant_id = v_tenant
        and lower(btrim(t.full_name)) = lower(btrim(v_name))
      order by t.created_at desc limit 1;
  end if;

  return query
  with binaan as (
    select hs.student_id as sid
    from public.halaqah_teachers ht
    join public.halaqah_students hs on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
    where ht.teacher_id = v_teacher
    union
    select ts.student_id as sid
    from public.teacher_students ts
    where ts.teacher_id = v_teacher
  )
  select distinct on (r.student_id) r.student_id, r.status::text, r.note
  from public.attendance_records r
  join public.attendance_sessions se on se.id = r.session_id
  where r.tenant_id = v_tenant
    and se.session_date = p_date
    and r.status::text in ('IZIN', 'SAKIT', 'ALPA')
    and r.student_id in (select b.sid from binaan b)
    and not exists (            -- hadir di sesi lain pada hari yang sama = boleh dinilai
      select 1 from public.attendance_records r2
      join public.attendance_sessions se2 on se2.id = r2.session_id
      where r2.student_id = r.student_id
        and r2.tenant_id = v_tenant
        and se2.session_date = p_date
        and r2.status::text = 'HADIR'
    )
  order by r.student_id, r.updated_at desc;
end;
$$;

revoke execute on function public.tartil_absences_on_date(date) from public;
grant execute on function public.tartil_absences_on_date(date) to authenticated;

-- 2. Trigger penegak ------------------------------------------------------------
create or replace function public.tartil_assessments_guard_absence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_date   date;
  v_status text;
begin
  if v_uid is null then return new; end if;                 -- proses sistem
  if new.deleted_at is not null then return new; end if;    -- soft-delete

  -- Update yang tidak menyentuh santri/tanggal/nilai tidak perlu dicek.
  if tg_op = 'UPDATE'
     and new.student_id  is not distinct from old.student_id
     and new.assessed_at is not distinct from old.assessed_at
     and new.status      is not distinct from old.status
     and new.score_value is not distinct from old.score_value
     and new.score_label is not distinct from old.score_label
     and new.material_id is not distinct from old.material_id then
    return new;
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is distinct from 'USTADZ' then return new; end if;  -- admin tidak dibatasi

  v_date := (new.assessed_at at time zone 'Asia/Jakarta')::date;

  select r.status::text into v_status
  from public.attendance_records r
  join public.attendance_sessions se on se.id = r.session_id
  where r.student_id = new.student_id
    and r.tenant_id = new.tenant_id
    and se.session_date = v_date
    and r.status::text in ('IZIN', 'SAKIT', 'ALPA')
    and not exists (
      select 1 from public.attendance_records r2
      join public.attendance_sessions se2 on se2.id = r2.session_id
      where r2.student_id = new.student_id
        and r2.tenant_id = new.tenant_id
        and se2.session_date = v_date
        and r2.status::text = 'HADIR'
    )
  order by r.updated_at desc
  limit 1;

  if v_status is not null then
    raise exception 'SANTRI_TIDAK_HADIR:%', v_status;
  end if;

  return new;
end;
$$;

drop trigger if exists tartil_assessments_guard_absence on public.tartil_assessments;
create trigger tartil_assessments_guard_absence
  before insert or update on public.tartil_assessments
  for each row execute function public.tartil_assessments_guard_absence();
