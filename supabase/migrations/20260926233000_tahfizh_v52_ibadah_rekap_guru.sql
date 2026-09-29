-- ============================================================================
-- TAHFIZH V52 — Rekap ibadah per santri (bahan evaluasi guru)
-- ============================================================================
-- Guru melihat: siapa yang rajin mengisi jurnal ibadah, rasio kegiatan yang
-- dicentang 30 hari terakhir, dan peringkat per kegiatan tertentu (siapa
-- paling rajin sholat subuh, muraja'ah, dst).
--
-- Scope:
--   • USTADZ        → santri di halaqah yang diampu (halaqah_teachers).
--   • KOORDINATOR/
--     ADMIN         → seluruh santri tenant.
--
-- Output: per santri — total centang, jumlah hari aktif, rasio thd katalog
-- aktif, serta breakdown per kegiatan (JSONB) untuk ranking "paling rajin".
-- Hanya santri dengan minimal 1 catatan yang dikembalikan (peringkat rajin).
--
-- Idempoten: drop + create ulang. SECURITY DEFINER, tenant dari profil.
-- ============================================================================

drop function if exists public.ibadah_rekap_guru(integer);

create or replace function public.ibadah_rekap_guru(p_days integer default 30)
returns table (
  student_id         uuid,
  student_name       text,
  halaqah_name       text,
  total_done         integer,
  active_days        integer,
  activity_ratio     integer,
  per_activity       jsonb,
  last_log_date      date
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
  v_from    date;
  v_days    integer;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Resolusi teacher dari nama profil (pola yang sama dengan modul lain).
  if v_role = 'USTADZ' then
    select t.id into v_teacher
    from public.teachers t
    where t.tenant_id = v_tenant
      and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
    order by t.created_at desc
    limit 1;
    if v_teacher is null then
      return;
    end if;
  end if;

  v_days := greatest(1, least(coalesce(p_days, 30), 90));
  v_from := current_date - (v_days - 1);

  return query
    with scope as (
      -- Santri dalam lingkup pemanggil + halaqah aktifnya.
      select s.id as student_id, s.full_name as student_name, h.name as halaqah_name
      from public.students s
      left join lateral (
        select h0.halaqah_id
        from public.halaqah_students h0
        where h0.student_id = s.id and h0.left_at is null
        limit 1
      ) hs on true
      left join public.halaqahs h on h.id = hs.halaqah_id
      where s.tenant_id = v_tenant
        and s.status = 'ACTIVE'
        and (
          v_role <> 'USTADZ'
          or exists (
            select 1
            from public.halaqah_teachers ht
            where ht.halaqah_id = hs.halaqah_id
              and ht.teacher_id = v_teacher
          )
        )
    ),
    logs as (
      select l.student_id, l.activity_id, l.log_date
      from public.ibadah_logs l
      where l.tenant_id = v_tenant
        and l.done
        and l.log_date between v_from and current_date
    ),
    per_student as (
      select
        l.student_id,
        count(*)::int               as total_done,
        count(distinct l.log_date)::int as active_days,
        max(l.log_date)             as last_log_date
      from logs l
      group by l.student_id
    ),
    per_pair as (
      -- Breakdown per kegiatan untuk ranking "paling rajin" per ibadah.
      select l.student_id, a.label, count(*)::int as cnt
      from logs l
      join public.ibadah_activities a on a.id = l.activity_id
      group by l.student_id, a.label
    ),
    per_json as (
      select student_id, jsonb_object_agg(label, cnt)::jsonb as per_activity
      from per_pair
      group by student_id
    ),
    cat as (
      -- Ukuran katalog aktif utk rasio keterisian.
      select count(*)::int as n
      from public.ibadah_activities a
      where a.is_active
        and (a.tenant_id = v_tenant or a.tenant_id is null)
    )
    select
      sc.student_id,
      sc.student_name,
      sc.halaqah_name,
      ps.total_done,
      ps.active_days,
      case when c.n = 0 then 0
           else least(100, round(
                  (ps.total_done::numeric
                   / (c.n::numeric * least(ps.active_days, v_days)))
                  * 100))::int
      end,
      pj.per_activity,
      ps.last_log_date
    from scope sc
    cross join cat c
    join per_student ps on ps.student_id = sc.student_id
    left join per_json pj on pj.student_id = sc.student_id
    order by ps.total_done desc, sc.student_name;
  return;
end;
$$;

grant execute on function public.ibadah_rekap_guru(integer) to authenticated;
