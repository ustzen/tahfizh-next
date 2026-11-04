-- ============================================================================
-- TAHFIZH V86 — Skala nilai huruf guru mendukung angka desimal
-- ============================================================================
-- Skor santri di Data Santri kini tampil dengan 1 desimal (V85), jadi batas
-- huruf juga harus bisa berdesimal: A+ = 96,0–100, A = 91,0–95,9, dst. Dengan
-- begitu skor 95,5 masih masuk A (bukan A+, bukan tanpa huruf).
--
--   1. teacher_grade_scales.min_value / max_value: integer → numeric(4,1).
--   2. Data lama dirapikan: skala bulat "A 91–95 | A+ 96–100" diubah menjadi
--      "A 91,0–95,9 | A+ 96,0–100" (batas atas = batas bawah band di atasnya
--      dikurangi 0,1) hanya bila selisihnya tepat 1. Band tertinggi tidak
--      diubah. Aman dijalankan ulang.
--   3. RPC teacher_rank_settings_save menerima angka dengan maksimal 1 desimal
--      (jsonb: 95.9). Validasi lain (tumpang tindih, 0–100, label) tetap.
-- ============================================================================

alter table public.teacher_grade_scales
  alter column min_value type numeric(4,1) using min_value::numeric,
  alter column max_value type numeric(4,1) using max_value::numeric;

with s as (
  select id,
         lead(min_value) over (partition by profile_id order by min_value) as next_min
  from public.teacher_grade_scales
)
update public.teacher_grade_scales t
set max_value = s.next_min - 0.1
from s
where t.id = s.id
  and s.next_min is not null
  and s.next_min - t.max_value = 1;

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
       or coalesce(e.x->>'min', '') !~ '^[0-9]{1,3}([.][0-9])?$'
       or coalesce(e.x->>'max', '') !~ '^[0-9]{1,3}([.][0-9])?$'
  ) then
    raise exception 'SKALA_TIDAK_VALID';
  end if;

  -- Pemeriksaan angka dipisah agar cast hanya jalan setelah format lolos.
  if exists (
    select 1
    from jsonb_array_elements(p_grades) e(x)
    where (e.x->>'min')::numeric > 100
       or (e.x->>'max')::numeric > 100
       or (e.x->>'min')::numeric > (e.x->>'max')::numeric
  ) then
    raise exception 'SKALA_TIDAK_VALID';
  end if;

  -- Tidak boleh ada rentang yang saling tumpang tindih.
  if exists (
    with r as (
      select (e.x->>'min')::numeric as mn, (e.x->>'max')::numeric as mx
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
         (e.x->>'min')::numeric, (e.x->>'max')::numeric, (e.ord)::int
  from jsonb_array_elements(p_grades) with ordinality as e(x, ord);
exception
  when unique_violation then
    raise exception 'LABEL_GANDA';
end;
$$;

grant execute on function public.teacher_rank_settings_save(text[], jsonb) to authenticated;
