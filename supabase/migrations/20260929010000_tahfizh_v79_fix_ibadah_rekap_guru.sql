-- ============================================================================
-- TAHFIZH V79 — Perbaikan Rekap Ibadah guru: RPC selalu error → rekap kosong
-- ============================================================================
-- Gejala: kartu "Rekap Ibadah Santri" di menu Jurnal Ibadah guru selalu kosong
-- ("Belum ada santri yang mengisi jurnal ibadah"), padahal santri/wali sudah
-- mencentang ibadah.
--
-- Penyebab: ibadah_rekap_guru (V52) mengembalikan tabel dengan kolom keluaran
-- bernama student_id, sementara CTE per_json menulis `select student_id ...
-- group by student_id` tanpa alias tabel. Di PL/pgSQL nama itu bentrok dengan
-- kolom keluaran → error 42702 "column reference student_id is ambiguous" di
-- SETIAP pemanggilan; aplikasi menelan error itu dan menampilkan daftar kosong.
--
-- Perbaikan:
--   • kolom di per_json diberi alias tabel (pp.student_id).
--   • scope santri: santri yang aktif di >1 halaqah tidak lagi tersaring acak
--     (sebelumnya hanya 1 halaqah sembarang yang dicek terhadap guru).
-- Selain itu logika & hasil identik dengan V52.
-- Idempotent: drop + create ulang.
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
  v_today   date;
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

  -- Resolusi guru: sama dengan semua modul halaqah (V12.11).
  -- Utama = link UUID profil→guru; fallback = pencocokan nama.
  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then
      return;
    end if;
  end if;

  v_days := greatest(1, least(coalesce(p_days, 30), 90));
  -- “Hari ini” versi WIB: ibadah dicatat vs tanggal kalender di Indonesia,
  -- bukan tanggal UTC server (yang bisa masih kemarin saat malam WIB).
  v_today := (now() at time zone 'Asia/Jakarta')::date;
  v_from := v_today - (v_days - 1);

  return query
    with scope as (
      -- Santri dalam lingkup pemanggil + halaqah aktifnya.
      -- Untuk guru: hanya halaqah yang ia ampu (santri di 2 halaqah tetap masuk
      -- bila salah satunya diampu guru ini). Admin/koordinator: semua santri.
      select s.id as student_id, s.full_name as student_name, min(h.name) as halaqah_name
      from public.students s
      left join public.halaqah_students hs
        on hs.student_id = s.id and hs.left_at is null
      left join public.halaqahs h on h.id = hs.halaqah_id
      where s.tenant_id = v_tenant
        and (
          v_role <> 'USTADZ'
          or exists (
            select 1
            from public.halaqah_teachers ht
            where ht.halaqah_id = hs.halaqah_id
              and ht.teacher_id = v_teacher
          )
        )
      group by s.id, s.full_name
    ),
    logs as (
      select l.student_id, l.activity_id, l.log_date
      from public.ibadah_logs l
      where l.tenant_id = v_tenant
        and l.done
        and l.log_date between v_from and v_today
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
      select pp.student_id, jsonb_object_agg(pp.label, pp.cnt)::jsonb as per_activity
      from per_pair pp
      group by pp.student_id
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
