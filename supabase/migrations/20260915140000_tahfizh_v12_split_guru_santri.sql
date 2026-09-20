-- ============================================================================
-- TAHFIZH V12.1 — MENU DATA GURU & DATA SANTRI DIPISAH
-- ============================================================================
-- Sebelumnya global search mengarahkan hasil GURU ke /koordinator/guru-santri
-- (menu gabungan). Karena menu kini dipisah menjadi /admin/guru,
-- /admin/santri, /koordinator/guru, dan /koordinator/santri, RPC search_global
-- diperbarui agar hasil GURU mendarat di menu Data Guru yang benar per role.
-- Idempotent — aman dijalankan berulang.
-- ============================================================================

create or replace function public.search_global(p_query text)
returns table (
  type        text,
  id          uuid,
  title       text,
  subtitle    text,
  href        text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_role   public.app_role;
  v_tenant uuid;
  v_q      text;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  select role, tenant_id into v_role, v_tenant
  from public.profiles where id = v_uid;

  if v_role is null then
    return;
  end if;

  v_q := '%' || trim(coalesce(p_query, '')) || '%';
  if v_q = '%%' then
    return;
  end if;

  -- DEVELOPER: lembaga (platform scope)
  if v_role = 'DEVELOPER' then
    return query
      select 'LEMBAGA'::text, t.id, t.name, t.kind, ('/developer/lembaga/' || t.id::text)
      from public.tenants t
      where t.name ilike v_q
      order by t.name
      limit 6;
    return;
  end if;

  if v_tenant is null then
    return;
  end if;

  -- ADMIN: santri, guru, halaqah lembaga (menu terpisah V12.1)
  if v_role = 'ADMIN' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/admin/santri'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
      order by s.full_name
      limit 6;

    return query
      select 'GURU'::text, g.id, g.full_name, ''::text, '/admin/guru'
      from public.teachers g
      where g.tenant_id = v_tenant and g.full_name ilike v_q
      order by g.full_name
      limit 5;

    return query
      select 'HALAQAH'::text, h.id, h.name, ''::text, '/admin/halaqah'
      from public.halaqahs h
      where h.tenant_id = v_tenant and h.name ilike v_q
      order by h.name
      limit 5;
    return;
  end if;

  -- KOORDINATOR: menu terpisah V12.1
  if v_role = 'KOORDINATOR' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/koordinator/santri'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
      order by s.full_name
      limit 6;

    return query
      select 'GURU'::text, g.id, g.full_name, ''::text, '/koordinator/guru'
      from public.teachers g
      where g.tenant_id = v_tenant and g.full_name ilike v_q
      order by g.full_name
      limit 5;

    return query
      select 'HALAQAH'::text, h.id, h.name, ''::text, '/koordinator/halaqah'
      from public.halaqahs h
      where h.tenant_id = v_tenant and h.name ilike v_q
      order by h.name
      limit 5;
    return;
  end if;

  -- USTADZ: hanya santri binaannya
  if v_role = 'USTADZ' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/ustadz/santri'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
        and exists (
          select 1 from public.teacher_students ts
          where ts.student_id = s.id
        )
      order by s.full_name
      limit 8;
    return;
  end if;

  -- WALI_SANTRI: hanya anak yang terhubung
  if v_role = 'WALI_SANTRI' then
    return query
      select 'SANTRI'::text, s.id,
             coalesce(nullif(s.nickname, ''), s.full_name),
             nullif(s.full_name, coalesce(nullif(s.nickname, ''), s.full_name)),
             '/wali/anak'
      from public.students s
      where s.tenant_id = v_tenant
        and (s.full_name ilike v_q or coalesce(s.nickname, '') ilike v_q)
        and exists (
          select 1 from public.guardian_students gs
          join public.guardians gd on gd.id = gs.guardian_id
          where gs.student_id = s.id and gd.profile_id = v_uid
        )
      order by s.full_name
      limit 8;
    return;
  end if;
end;
$$;

grant execute on function public.search_global(text) to authenticated;
