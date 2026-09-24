-- ============================================================================
-- TAHFIZH V37 — NIS LEMBAGA PADA MENU TAHFIDZ (regresi V33)
-- ============================================================================
-- V33 mendefinisikan ulang tahfidz_surahs_grid() dan tanpa sengaja
-- mengembalikan 'code' = students.business_code (S-21, dst), menimpa perbaikan
-- V30. Migrasi ini mengembalikan 'code' = students.nis (NIS lembaga).
-- Idempoten; hanya body fungsi, tanpa perubahan tabel/RLS/data.
-- ============================================================================

create or replace function public.tahfidz_surahs_grid()
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
  v_students jsonb;
  v_rows    jsonb;
begin
  if v_uid is null then
    raise exception 'AKSES_DITOLAK';
  end if;

  select tenant_id::text, role::text into v_tenant, v_role
  from public.profiles where id = v_uid;

  if v_tenant is null then
    raise exception 'AKSES_DITOLAK';
  end if;
  if v_role not in ('USTADZ', 'KOORDINATOR', 'ADMIN') then
    raise exception 'AKSES_DITOLAK';
  end if;

  -- V33: link UUID dulu (akurat walau nama profil ≠ nama guru), fallback nama.
  if v_role = 'USTADZ' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null then
      select t.id into v_teacher
      from public.teachers t
      where t.tenant_id = v_tenant::uuid
        and lower(btrim(t.full_name)) = lower(btrim((select full_name from public.profiles where id = v_uid)))
      order by t.created_at desc
      limit 1;
    end if;
    if v_teacher is null then
      return jsonb_build_object('students', '[]'::jsonb, 'rows', '[]'::jsonb);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.full_name, 'nickname', s.nickname, 'code', nullif(btrim(s.nis), '')
         ) order by lower(btrim(s.full_name))), '[]'::jsonb)
  into v_students
  from public.students s
  where s.tenant_id = v_tenant::uuid
    and s.status = 'ACTIVE'
    and (v_role <> 'USTADZ' or exists (
      select 1 from public.halaqah_teachers ht
      join public.halaqah_students h1 on h1.halaqah_id = ht.halaqah_id and h1.left_at is null
      where ht.teacher_id = v_teacher and h1.student_id = s.id
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
           'surahId', ts.id,
           'name', coalesce(ts.name_override, m.name),
           'sortOrder', ts.sort_order
         ) order by ts.sort_order), '[]'::jsonb)
  into v_rows
  from public.tahfidz_tenant_surahs ts
  left join public.tahfidz_surahs m on m.id = ts.surah_id
  where ts.tenant_id = v_tenant::uuid
    and ts.is_active = true;

  return jsonb_build_object('students', v_students, 'rows', v_rows);
end;
$$;

grant execute on function public.tahfidz_surahs_grid() to authenticated;
