-- ============================================================================
-- TAHFIZH V78 — Kriteria peringkat & skala nilai huruf yang diatur sendiri guru
-- ============================================================================
-- Menu Data Santri (guru) kini punya panel "Kriteria Penilaian & Peringkat":
--   1. Guru memilih MODUL mana saja yang dihitung untuk peringkat:
--      TAHFIDZ, TARTIL, HADITS, DOA, TAJWID, TUGAS, SETORAN, ABSENSI.
--      Default = semua kecuali ABSENSI (identik dengan perilaku V46).
--   2. Guru mengatur SKALA NILAI HURUF sendiri (mis. A+ = 96-100, B- = 71-75).
--      Default memakai skala standar (A+ 96-100 ... D 0-55); guru bebas ubah.
--
-- Skala ini dipakai untuk menampilkan nilai huruf pada skor peringkat. Skala
-- input penilaian milik admin (tahfidz_grade_settings) TIDAK berubah.
--
-- Perubahan:
--   • tabel  teacher_rank_settings   (pilihan modul, 1 baris per guru)
--   • tabel  teacher_grade_scales    (rentang huruf, banyak baris per guru)
--   • RPC    teacher_rank_settings_save(p_modules, p_grades)  — simpan atomik
--   • RPC    teacher_rank_settings_reset()                    — kembali default
--   • RPC    teacher_students_rank() — dibaca ulang memakai pilihan modul
--            + modul ABSENSI + rincian skor per modul ('moduls').
-- Idempotent: create if not exists / drop policy if exists / create or replace.
-- ============================================================================

create table if not exists public.teacher_rank_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  modules    text[] not null
    default array['TAHFIDZ','TARTIL','HADITS','DOA','TAJWID','TUGAS','SETORAN'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_rank_modules_valid check (
    cardinality(modules) between 1 and 8
    and modules <@ array['TAHFIDZ','TARTIL','HADITS','DOA','TAJWID','TUGAS','SETORAN','ABSENSI']
  )
);

create table if not exists public.teacher_grade_scales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 10),
  min_value  integer not null check (min_value between 0 and 100),
  max_value  integer not null check (max_value between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, label),
  constraint teacher_grade_range_valid check (min_value <= max_value)
);

create index if not exists teacher_grade_scales_profile_idx
  on public.teacher_grade_scales (profile_id, sort_order);

drop trigger if exists teacher_rank_settings_updated_at on public.teacher_rank_settings;
create trigger teacher_rank_settings_updated_at
  before update on public.teacher_rank_settings
  for each row execute function public.touch_updated_at();

alter table public.teacher_rank_settings enable row level security;
alter table public.teacher_grade_scales  enable row level security;

-- Pengaturan bersifat pribadi: hanya pemilik akun yang boleh membaca.
-- Penulisan HANYA lewat RPC di bawah (tanpa policy insert/update/delete).
drop policy if exists teacher_rank_settings_select on public.teacher_rank_settings;
create policy teacher_rank_settings_select on public.teacher_rank_settings
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists teacher_grade_scales_select on public.teacher_grade_scales;
create policy teacher_grade_scales_select on public.teacher_grade_scales
  for select to authenticated
  using (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Simpan pengaturan (atomik). p_grades = [{"label":"A+","min":96,"max":100}, ...]
-- ----------------------------------------------------------------------------
create or replace function public.teacher_rank_settings_save(
  p_modules text[],
  p_grades  jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_modules text[];
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- Modul: unik, 1..8, hanya modul yang dikenal.
  select coalesce(array_agg(distinct m), '{}') into v_modules
  from unnest(coalesce(p_modules, '{}')) m;

  if cardinality(v_modules) = 0 then
    raise exception 'MODUL_KOSONG';
  end if;
  if not (v_modules <@ array['TAHFIDZ','TARTIL','HADITS','DOA','TAJWID','TUGAS','SETORAN','ABSENSI']) then
    raise exception 'MODUL_TIDAK_VALID';
  end if;

  -- Skala huruf: array 1..20 baris.
  if p_grades is null or jsonb_typeof(p_grades) <> 'array'
     or jsonb_array_length(p_grades) not between 1 and 20 then
    raise exception 'SKALA_TIDAK_VALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_grades) e(x)
    where jsonb_typeof(e.x) <> 'object'
       or btrim(coalesce(e.x->>'label', '')) = ''
       or char_length(btrim(e.x->>'label')) > 10
       or coalesce(e.x->>'min', '') !~ '^[0-9]{1,3}$'
       or coalesce(e.x->>'max', '') !~ '^[0-9]{1,3}$'
  ) then
    raise exception 'SKALA_TIDAK_VALID';
  end if;

  -- Pemeriksaan angka dipisah agar cast hanya jalan setelah format lolos.
  if exists (
    select 1
    from jsonb_array_elements(p_grades) e(x)
    where (e.x->>'min')::int > 100
       or (e.x->>'max')::int > 100
       or (e.x->>'min')::int > (e.x->>'max')::int
  ) then
    raise exception 'SKALA_TIDAK_VALID';
  end if;

  -- Tidak boleh ada rentang yang saling tumpang tindih.
  if exists (
    with r as (
      select (e.x->>'min')::int as mn, (e.x->>'max')::int as mx
      from jsonb_array_elements(p_grades) e(x)
    ), o as (
      select mn, mx, lag(mx) over (order by mn, mx) as prev_max from r
    )
    select 1 from o where prev_max is not null and mn <= prev_max
  ) then
    raise exception 'SKALA_TUMPANG_TINDIH';
  end if;

  insert into public.teacher_rank_settings (profile_id, tenant_id, modules)
  values (v_uid, v_tenant, v_modules)
  on conflict (profile_id) do update
    set modules = excluded.modules, tenant_id = excluded.tenant_id;

  delete from public.teacher_grade_scales where profile_id = v_uid;

  insert into public.teacher_grade_scales (tenant_id, profile_id, label, min_value, max_value, sort_order)
  select v_tenant, v_uid, btrim(e.x->>'label'),
         (e.x->>'min')::int, (e.x->>'max')::int, (e.ord)::int
  from jsonb_array_elements(p_grades) with ordinality as e(x, ord);
exception
  when unique_violation then
    raise exception 'LABEL_GANDA';
end;
$$;

grant execute on function public.teacher_rank_settings_save(text[], jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Kembalikan ke default (hapus pengaturan pribadi guru).
-- ----------------------------------------------------------------------------
create or replace function public.teacher_rank_settings_reset()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  select role::text into v_role from public.profiles where id = v_uid;
  if v_role is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  delete from public.teacher_rank_settings where profile_id = v_uid;
  delete from public.teacher_grade_scales  where profile_id = v_uid;
end;
$$;

grant execute on function public.teacher_rank_settings_reset() to authenticated;

-- ----------------------------------------------------------------------------
-- Peringkat guru (Data Santri) — kini mengikuti pilihan modul guru.
-- Pemointan per modul tetap V44; tie-break NIS tetap V46.
-- ----------------------------------------------------------------------------
create or replace function public.teacher_students_rank()
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
  v_out     jsonb;
  v_modules text[];
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null or v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  v_teacher := public.current_teacher_id();

  -- V78 — modul yang dipakai guru ini untuk peringkat (default: semua modul
  -- nilai kecuali absensi, sama persis dengan perilaku V46).
  select r.modules into v_modules
  from public.teacher_rank_settings r
  where r.profile_id = v_uid;
  if v_modules is null or cardinality(v_modules) = 0 then
    v_modules := array['TAHFIDZ','TARTIL','HADITS','DOA','TAJWID','TUGAS','SETORAN'];
  end if;

  with halaqah_ampu as (
    select distinct ht.halaqah_id
    from public.halaqah_teachers ht
    where v_role = 'USTADZ' and v_teacher is not null and ht.teacher_id = v_teacher
    union all
    select h.id
    from public.halaqahs h
    where v_role in ('KOORDINATOR', 'ADMIN') and h.tenant_id = v_tenant
  ),
  sekelas as (
    select hs.halaqah_id, hs.student_id
    from public.halaqah_students hs
    where hs.left_at is null
      and hs.halaqah_id in (select halaqah_id from halaqah_ampu)
  ),
  rows_all as (
    select s.student_id, 'TAHFIDZ'::text as modul,
           t.score_value as sv, t.score_label as lbl, null::int as fb
    from sekelas s
    join public.tahfidz_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.status = 'DINILAI'
    union all
    select s.student_id, 'TARTIL', t.score_value, t.score_label, null::int
    from sekelas s
    join public.tartil_assessments t
      on t.student_id = s.student_id and t.tenant_id = v_tenant
    where t.deleted_at is null and t.status = 'DINILAI'
    union all
    select s.student_id, l.module_type::text, l.score_value, l.score_label,
           case l.status::text
             when 'PERLU_MENGULANG' then 65
             when 'PERLU_LATIHAN'   then 65
             when 'BELUM_SELESAI'   then 50
             when 'BELUM_MENGUASAI' then 50
             else 85 end
    from sekelas s
    join public.learning_assessments l
      on l.student_id = s.student_id and l.tenant_id = v_tenant
    where l.deleted_at is null
    union all
    select s.student_id, 'TUGAS', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tugas_halaqah_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'TAJWID', sc.score_value, sc.score_label, null::int
    from sekelas s
    join public.tajwid_materi_scores sc
      on sc.student_id = s.student_id and sc.tenant_id = v_tenant
    union all
    select s.student_id, 'SETORAN', sb.score_value, sb.score_label,
           case sb.result::text
             when 'PERLU_MENGULANG' then 65
             when 'DITUNDA'         then 50
             else 85 end
    from sekelas s
    join public.tahfidz_submissions sb
      on sb.student_id = s.student_id and sb.tenant_id = v_tenant
    where sb.deleted_at is null
  ),
  rows_res as (
    select r.student_id, r.modul,
           coalesce(r.sv, g.max_value, r.fb) as poin,
           (r.sv is not null or g.max_value is not null) as ada_nilai
    from rows_all r
    left join public.tahfidz_grade_settings g
      on g.tenant_id = v_tenant
     and lower(btrim(g.label)) = lower(btrim(r.lbl))
  ),
  agg_val as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_fb as (
    select student_id, modul, avg(poin) as poin
    from rows_res
    where not ada_nilai and poin is not null
    group by student_id, modul
  ),
  agg_cnt as (
    select student_id, modul, count(*)::numeric as jml
    from rows_res
    group by student_id, modul
  ),
  scope_tenant as (
    select 'TAHFIDZ'::text as modul,
           (select count(*) from public.tahfidz_tenant_surahs
             where tenant_id = v_tenant and is_active)::numeric as total
    union all
    select 'TARTIL',
           (select count(*) from public.tartil_materials
             where tenant_id = v_tenant and is_active)::numeric
    union all
    select 'TAJWID',
           (select count(*) from public.tajwid_materi
             where tenant_id = v_tenant and deleted_at is null)::numeric
  ),
  tugas_scope as (
    select sc.student_id, count(t.id)::numeric as total
    from (select distinct student_id, halaqah_id from sekelas) sc
    left join public.tugas_halaqah t
      on t.halaqah_id = sc.halaqah_id
     and t.tenant_id = v_tenant
     and t.deleted_at is null
    group by sc.student_id
  ),
  agg_ratio as (
    select c.student_id, c.modul,
           case when st.total > 0 then 100.0 * c.jml / st.total
                when ts.total > 0 then 100.0 * c.jml / ts.total
           end as poin
    from agg_cnt c
    left join scope_tenant st on st.modul = c.modul
    left join tugas_scope ts on ts.student_id = c.student_id
    where c.modul in ('TAHFIDZ', 'TARTIL', 'TAJWID', 'TUGAS')
  ),
  skor_modul as (
    select v.student_id, v.modul,
           round(coalesce(a.poin, f.poin, r.poin))::int as poin
    from (select distinct student_id, modul from rows_res) v
    left join agg_val   a on a.student_id = v.student_id and a.modul = v.modul
    left join agg_fb    f on f.student_id = v.student_id and f.modul = v.modul
    left join agg_ratio r on r.student_id = v.student_id and r.modul = v.modul
  ),
  abs_skor as (
    -- V78 — Absensi: persentase HADIR dari seluruh catatan presensi santri.
    select s.student_id, 'ABSENSI'::text as modul,
           round(100.0 * count(*) filter (where r.status::text = 'HADIR')
                 / nullif(count(*), 0))::int as poin
    from (select distinct student_id, halaqah_id from sekelas) s
    join public.attendance_records r
      on r.student_id = s.student_id
     and r.halaqah_id = s.halaqah_id
     and r.tenant_id = v_tenant
    group by s.student_id
  ),
  skor_modul_all as (
    select student_id, modul, poin from skor_modul
    union all
    select student_id, modul, poin from abs_skor
  ),
  skor as (
    select student_id, round(avg(poin))::int as rata
    from skor_modul_all
    where poin is not null and modul = any(v_modules)
    group by student_id
  ),
  ranking as (
    select s.student_id, s.halaqah_id,
           k.rata,
           mm.j as moduls,
           case when k.rata is null then null
                else dense_rank() over (
                  partition by s.halaqah_id
                  order by k.rata desc,
                           coalesce(nullif(regexp_replace(st.nis, '[^0-9]', '', 'g'), '')::numeric, 0) desc,
                           st.nis desc nulls last
                )
           end as rank,
           count(k.rata) over (partition by s.halaqah_id)::int as total_ranked
    from (select distinct student_id, halaqah_id from sekelas) s
    join public.students st on st.id = s.student_id
    left join skor k on k.student_id = s.student_id
    left join lateral (
      select jsonb_object_agg(m.modul, m.poin) as j
      from skor_modul_all m
      where m.student_id = s.student_id
        and m.poin is not null
        and m.modul = any(v_modules)
    ) mm on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId',   r.student_id,
           'halaqahId',   r.halaqah_id,
           'rank',        r.rank,
           'totalRanked', coalesce(r.total_ranked, 0),
           'avgScore',    r.rata,
           'moduls',      coalesce(r.moduls, '{}'::jsonb)
         )), '[]'::jsonb)
  into v_out
  from ranking r;

  return v_out;
end;
$$;
grant execute on function public.teacher_students_rank() to authenticated;
