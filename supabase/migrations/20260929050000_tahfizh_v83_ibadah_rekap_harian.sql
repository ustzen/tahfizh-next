-- ============================================================================
-- TAHFIZH V83 — Rekap Ibadah HARIAN per santri (tabel evaluasi guru)
-- ============================================================================
-- Guru perlu melihat, untuk SATU tanggal tertentu (hari ini atau hari-hari
-- sebelumnya), santri mana yang sudah / belum mengerjakan tiap ibadah.
--
-- RPC baru: ibadah_rekap_harian(p_date)
--   • Mengembalikan SEMUA santri aktif dalam lingkup pemanggil (termasuk yang
--     belum mengisi sama sekali), beserta daftar activity_id yang dicentang
--     "done" pada tanggal itu.
--   • Lingkup sama dengan ibadah_rekap_guru (V79): guru = halaqah yang diampu,
--     admin/koordinator = seluruh santri lembaga.
--   • p_date null / masa depan → dipaksa ke "hari ini" versi WIB.
-- Idempotent: drop + create ulang.
-- ============================================================================

drop function if exists public.ibadah_rekap_harian(date);

create or replace function public.ibadah_rekap_harian(p_date date default null)
returns table (
  student_id   uuid,
  student_name text,
  halaqah_name text,
  done_ids     uuid[]
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
  v_today   date;
  v_date    date;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  if v_role = 'USTADZ' then
    v_teacher := public.halaqah_current_teacher();
    if v_teacher is null then
      return;
    end if;
  end if;

  v_today := (now() at time zone 'Asia/Jakarta')::date;
  v_date  := least(coalesce(p_date, v_today), v_today);

  return query
    with scope as (
      select s.id as student_id, s.full_name as student_name, min(h.name) as halaqah_name
      from public.students s
      left join public.halaqah_students hs
        on hs.student_id = s.id and hs.left_at is null
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
      group by s.id, s.full_name
    ),
    done_day as (
      select l.student_id as sid, array_agg(l.activity_id) as ids
      from public.ibadah_logs l
      where l.tenant_id = v_tenant
        and l.done
        and l.log_date = v_date
      group by l.student_id
    )
    select
      sc.student_id,
      sc.student_name,
      sc.halaqah_name,
      coalesce(dd.ids, '{}'::uuid[])
    from scope sc
    left join done_day dd on dd.sid = sc.student_id
    order by sc.halaqah_name nulls last, sc.student_name;
  return;
end;
$$;

grant execute on function public.ibadah_rekap_harian(date) to authenticated;
