-- ============================================================================
-- TAHFIZH V13 — Raport: galeri contoh + "Raport Utama Lembaga"
-- ============================================================================
-- Tujuan migrasi ini:
--   1. Kolom is_primary pada report_templates — satu template per lembaga
--      (dan satu template global bawaan) bisa ditandai sebagai RAPORT UTAMA.
--   2. RPC report_template_set_primary — ADMIN, KOORDINATOR, dan USTADZ
--      lembaga boleh menetapkan raport utama; DEVELOPER untuk template global.
--   3. Hak ubah template diperluas: ADMIN + KOORDINATOR + USTADZ boleh
--      menyalin, mengubah layout, mengaktifkan, dan menyimpan template milik
--      lembaganya sendiri (tetap tenant-scoped penuh; hapus tetap ADMIN).
--   4. RPC galeri (report_template_gallery / report_dev_gallery) yang ikut
--      mengirim LAYOUT sehingga UI bisa menampilkan CONTOH RAPORT secara
--      langsung, bukan sekadar nama template.
--   5. Layout ketiga template bawaan diperbarui: 1 Kolom, 2 Kolom (contoh
--      lengkap), dan Fleksibel 2 Halaman.
-- Idempoten & repair-safe: semua create or replace / if not exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom is_primary + indeks unik parsial
-- ---------------------------------------------------------------------------
alter table public.report_templates
  add column if not exists is_primary boolean not null default false;

-- Satu raport utama per lembaga, dan satu contoh utama bawaan (tenant_id null).
drop index if exists report_templates_primary_tenant_idx;
drop index if exists report_templates_primary_global_idx;
drop index if exists report_templates_primary_scope_idx;
create unique index report_templates_primary_scope_idx
  on public.report_templates (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_primary;

-- ---------------------------------------------------------------------------
-- 2. Helper: siapa yang boleh mengelola template lembaga
-- ---------------------------------------------------------------------------
create or replace function public.report_can_manage_templates()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('ADMIN', 'KOORDINATOR', 'USTADZ'),
    false
  );
$$;

grant execute on function public.report_can_manage_templates() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Simpan layout dari Report Builder — ADMIN/KOORDINATOR/USTADZ
-- ---------------------------------------------------------------------------
create or replace function public.report_template_save_layout(
  p_template_id uuid,
  p_layout      jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_t       public.report_templates;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_t from public.report_templates where id = p_template_id;
  if v_t is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;
  if not public.report_layout_valid(p_layout) then raise exception 'LAYOUT_TIDAK_VALID'; end if;

  if v_t.tenant_id is null then
    -- Template global hanya boleh diubah DEVELOPER (rule #4).
    if v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  else
    -- Salinan lembaga: admin, koordinator, dan guru lembaga tersebut.
    if v_profile.role not in ('ADMIN', 'KOORDINATOR', 'USTADZ')
       or v_profile.tenant_id is distinct from v_t.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
  end if;

  update public.report_templates
     set layout = p_layout,
         version = version + 1,
         updated_at = now()
   where id = p_template_id;

  -- on conflict: riwayat versi bersifat pelengkap, tidak boleh menggagalkan simpan.
  insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
  values (v_t.tenant_id, p_template_id, v_t.version + 1, p_layout, auth.uid(), 'Perubahan layout')
  on conflict (template_id, version) do nothing;
end;
$$;

grant execute on function public.report_template_save_layout(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tandai sebagai RAPORT UTAMA lembaga
-- ---------------------------------------------------------------------------
create or replace function public.report_template_set_primary(p_template_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_t       public.report_templates;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_t from public.report_templates where id = p_template_id;
  if v_t is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if v_t.tenant_id is null then
    if v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
    update public.report_templates set is_primary = false
     where tenant_id is null and is_primary and id <> v_t.id;
    update public.report_templates set is_primary = true, is_active = true
     where id = v_t.id;
  else
    if v_profile.role not in ('ADMIN', 'KOORDINATOR', 'USTADZ')
       or v_profile.tenant_id is distinct from v_t.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
    update public.report_templates set is_primary = false
     where tenant_id = v_t.tenant_id and is_primary and id <> v_t.id;
    update public.report_templates set is_primary = true, is_active = true
     where id = v_t.id;
  end if;
end;
$$;

grant execute on function public.report_template_set_primary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Duplikat / instansiasi template — diperluas ke koordinator & guru
-- ---------------------------------------------------------------------------
create or replace function public.report_template_duplicate(p_template_id uuid, p_new_name text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_src     public.report_templates;
  v_id      uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_src from public.report_templates where id = p_template_id;
  if v_src is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if v_src.tenant_id is null then
    if v_profile.role = 'DEVELOPER' then
      insert into public.report_templates (
        tenant_id, created_by, source_template_id, name, description,
        paper, orientation, layout, version
      ) values (
        null, auth.uid(), v_src.id,
        coalesce(nullif(trim(coalesce(p_new_name, '')), ''), v_src.name || ' (Salinan)'),
        v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
      ) returning id into v_id;
    elsif v_profile.role in ('ADMIN', 'KOORDINATOR', 'USTADZ') and v_profile.tenant_id is not null then
      -- Salinan milik lembaga (rule #5): perubahan Developer tidak menariknya.
      insert into public.report_templates (
        tenant_id, created_by, source_template_id, name, description,
        paper, orientation, layout, version
      ) values (
        v_profile.tenant_id, auth.uid(), v_src.id,
        coalesce(nullif(trim(coalesce(p_new_name, '')), ''), v_src.name),
        v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
      ) returning id into v_id;
    else raise exception 'AKSES_DITOLAK'; end if;
  else
    if v_profile.role not in ('ADMIN', 'KOORDINATOR', 'USTADZ')
       or v_src.tenant_id is distinct from v_profile.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
    insert into public.report_templates (
      tenant_id, created_by, source_template_id, name, description,
      paper, orientation, layout, version
    ) values (
      v_profile.tenant_id, auth.uid(), v_src.id,
      coalesce(nullif(trim(coalesce(p_new_name, '')), ''), v_src.name || ' (Salinan)'),
      v_src.description, v_src.paper, v_src.orientation, v_src.layout, 1
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.report_template_duplicate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Aktif/nonaktif — diperluas ke koordinator & guru
-- ---------------------------------------------------------------------------
create or replace function public.report_template_set_active(p_template_id uuid, p_active boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_t       public.report_templates;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_t from public.report_templates where id = p_template_id;
  if v_t is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

  if v_t.tenant_id is null then
    if v_profile.role <> 'DEVELOPER' then raise exception 'AKSES_DITOLAK'; end if;
  else
    if v_profile.role not in ('ADMIN', 'KOORDINATOR', 'USTADZ')
       or v_profile.tenant_id is distinct from v_t.tenant_id then
      raise exception 'AKSES_DITOLAK';
    end if;
  end if;

  -- Raport utama tidak boleh dinonaktifkan tanpa menunjuk pengganti.
  if v_t.is_primary and not p_active then raise exception 'TEMPLATE_DIGUNAKAN'; end if;

  update public.report_templates set is_active = p_active where id = v_t.id;
end;
$$;

grant execute on function public.report_template_set_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Simpan metadata template (nama/kertas/orientasi) — staf lembaga
-- ---------------------------------------------------------------------------
create or replace function public.report_template_save(
  p_template_id uuid default null,
  p_name        text default null,
  p_description text default null,
  p_paper       text default 'A4',
  p_orientation text default 'PORTRAIT',
  p_layout      jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_id      uuid;
  v_old     public.report_templates;
  v_is_dev  boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then raise exception 'AKSES_DITOLAK'; end if;
  v_is_dev := v_profile.role = 'DEVELOPER';

  if p_layout is not null and not public.report_layout_valid(p_layout) then
    raise exception 'LAYOUT_TIDAK_VALID';
  end if;
  if p_paper not in ('A4','A5','LETTER') or p_orientation not in ('PORTRAIT','LANDSCAPE') then
    raise exception 'LAYOUT_TIDAK_VALID';
  end if;

  if p_template_id is null then
    if not v_is_dev and not public.report_can_manage_templates() then raise exception 'AKSES_DITOLAK'; end if;
    if p_name is null or char_length(trim(p_name)) not between 1 and 120 then
      raise exception 'NAMA_TIDAK_VALID';
    end if;

    insert into public.report_templates (
      tenant_id, created_by, name, description, paper, orientation, layout
    ) values (
      case when v_is_dev then null else v_profile.tenant_id end,
      auth.uid(), trim(p_name), p_description, p_paper, p_orientation,
      coalesce(p_layout, '{"pages":[{"components":[]}]}'::jsonb)
    ) returning id into v_id;

    insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
    values (case when v_is_dev then null else v_profile.tenant_id end,
            v_id, 1, coalesce(p_layout, '{"pages":[{"components":[]}]}'::jsonb), auth.uid(), 'Initial')
    on conflict (template_id, version) do nothing;
  else
    select * into v_old from public.report_templates where id = p_template_id;
    if v_old is null then raise exception 'TEMPLATE_TIDAK_DITEMUKAN'; end if;

    if v_old.tenant_id is null then
      if not v_is_dev then raise exception 'AKSES_DITOLAK'; end if;
    else
      if v_profile.role not in ('ADMIN', 'KOORDINATOR', 'USTADZ')
         or v_old.tenant_id is distinct from v_profile.tenant_id then
        raise exception 'AKSES_DITOLAK';
      end if;
    end if;

    insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
    values (v_old.tenant_id, v_old.id, v_old.version, v_old.layout, auth.uid(), 'Sebelum perubahan')
    on conflict (template_id, version) do nothing;

    update public.report_templates set
      name        = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      description = coalesce(p_description, description),
      paper       = p_paper,
      orientation = p_orientation,
      layout      = coalesce(p_layout, layout),
      version     = v_old.version + 1
    where id = v_old.id;

    if p_layout is not null then
      insert into public.report_template_versions (tenant_id, template_id, version, layout, changed_by, note)
      values (v_old.tenant_id, v_old.id, v_old.version + 1, p_layout, auth.uid(), 'Perubahan layout')
      on conflict (template_id, version) do nothing;
    end if;

    v_id := v_old.id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.report_template_save(uuid, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Galeri template — ikut mengirim LAYOUT agar contoh raport bisa dirender
-- ---------------------------------------------------------------------------
drop function if exists public.report_template_gallery();
create function public.report_template_gallery()
returns table (
  id           uuid,
  scope        text,
  name         text,
  description  text,
  paper        text,
  orientation  text,
  version      integer,
  is_active    boolean,
  is_primary   boolean,
  layout       jsonb,
  report_count bigint
)
language sql
security definer set search_path = public
as $$
  select t.id, 'TENANT'::text, t.name, t.description, t.paper, t.orientation,
         t.version, t.is_active, t.is_primary, t.layout,
         (select count(*) from public.reports r where r.template_id = t.id)
  from public.report_templates t
  where t.tenant_id = public.current_tenant_id()
    and public.report_can_manage_templates()

  union all

  select g.id, 'GLOBAL'::text, g.name, g.description, g.paper, g.orientation,
         g.version, g.is_active, g.is_primary, g.layout, 0::bigint
  from public.report_templates g
  where g.tenant_id is null and g.is_active
    and public.report_can_manage_templates()
  order by 2 desc, 9 desc, 3;
$$;

grant execute on function public.report_template_gallery() to authenticated;

drop function if exists public.report_dev_gallery();
create function public.report_dev_gallery()
returns table (
  id          uuid,
  name        text,
  description text,
  paper       text,
  orientation text,
  version     integer,
  is_active   boolean,
  is_primary  boolean,
  layout      jsonb,
  copy_count  bigint
)
language sql
security definer set search_path = public
as $$
  select g.id, g.name, g.description, g.paper, g.orientation, g.version,
         g.is_active, g.is_primary, g.layout,
         (select count(*) from public.report_templates c where c.source_template_id = g.id)
  from public.report_templates g
  where g.tenant_id is null
    and public.is_platform_developer()
  order by 8 desc, 2;
$$;

grant execute on function public.report_dev_gallery() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Layout bawaan diperbarui (1 Kolom, 2 Kolom, Fleksibel 2 Halaman)
-- ---------------------------------------------------------------------------

insert into public.report_templates (tenant_id, name, description, paper, orientation, layout, is_primary)
select null, 'Raport 1 Kolom', 'Satu kolom, alur membaca dari atas ke bawah: kop lembaga, identitas santri, rekap nilai, presensi & catatan, lalu tanda tangan.', 'A4', 'PORTRAIT', '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 180, "w": 714, "h": 34, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 19, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 216, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 11, "align": "center"}, "props": {}}, {"id": "c9-period", "type": "PERIOD", "x": 40, "y": 234, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 278, "w": 714, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 308, "w": 714, "h": 104, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 430, "w": 714, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c13-score_table", "type": "SCORE_TABLE", "x": 40, "y": 460, "w": 714, "h": 300, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID", "TARGET", "TUGAS"]}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 776, "w": 340, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c15-attendance", "type": "ATTENDANCE", "x": 40, "y": 806, "w": 340, "h": 140, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c16-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 776, "w": 340, "h": 24, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran"}}, {"id": "c17-notes", "type": "NOTES", "x": 414, "y": 806, "w": 340, "h": 140, "z": 17, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"label": "Catatan & Saran", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c18-divider", "type": "DIVIDER", "x": 40, "y": 958, "w": 714, "h": 4, "z": 18, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c19-signatures", "type": "SIGNATURES", "x": 40, "y": 970, "w": 714, "h": 104, "z": 19, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c20-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 20, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb, false
where not exists (
  select 1 from public.report_templates where tenant_id is null and name = 'Raport 1 Kolom'
);

update public.report_templates
   set description = 'Satu kolom, alur membaca dari atas ke bawah: kop lembaga, identitas santri, rekap nilai, presensi & catatan, lalu tanda tangan.',
       paper = 'A4',
       orientation = 'PORTRAIT',
       layout = '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 180, "w": 714, "h": 34, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 19, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 216, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 11, "align": "center"}, "props": {}}, {"id": "c9-period", "type": "PERIOD", "x": 40, "y": 234, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 278, "w": 714, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 308, "w": 714, "h": 104, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 430, "w": 714, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c13-score_table", "type": "SCORE_TABLE", "x": 40, "y": 460, "w": 714, "h": 300, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID", "TARGET", "TUGAS"]}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 776, "w": 340, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c15-attendance", "type": "ATTENDANCE", "x": 40, "y": 806, "w": 340, "h": 140, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c16-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 776, "w": 340, "h": 24, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran"}}, {"id": "c17-notes", "type": "NOTES", "x": 414, "y": 806, "w": 340, "h": 140, "z": 17, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"label": "Catatan & Saran", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c18-divider", "type": "DIVIDER", "x": 40, "y": 958, "w": 714, "h": 4, "z": 18, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c19-signatures", "type": "SIGNATURES", "x": 40, "y": 970, "w": 714, "h": 104, "z": 19, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c20-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 20, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb,
       is_active = true,
       version = version + 1,
       updated_at = now()
 where tenant_id is null
   and name = 'Raport 1 Kolom';

insert into public.report_templates (tenant_id, name, description, paper, orientation, layout, is_primary)
select null, 'Raport 2 Kolom', 'Contoh lengkap dua kolom dalam satu halaman: kiri identitas, rekap nilai & presensi; kanan capaian, keterangan predikat & catatan guru.', 'A4', 'PORTRAIT', '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 178, "w": 714, "h": 32, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 212, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c9-semester", "type": "SEMESTER", "x": 40, "y": 230, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 262, "w": 340, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 292, "w": 340, "h": 112, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 420, "w": 340, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c13-score_table", "type": "SCORE_TABLE", "x": 40, "y": 450, "w": 340, "h": 330, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID"]}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 796, "w": 340, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c15-attendance", "type": "ATTENDANCE", "x": 40, "y": 826, "w": 340, "h": 130, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c16-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 262, "w": 340, "h": 24, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Capaian Periode Ini"}}, {"id": "c17-achievement_summary", "type": "ACHIEVEMENT_SUMMARY", "x": 414, "y": 292, "w": 340, "h": 170, "z": 17, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c18-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 478, "w": 340, "h": 24, "z": 18, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Keterangan Predikat"}}, {"id": "c19-grade_legend", "type": "GRADE_LEGEND", "x": 414, "y": 508, "w": 340, "h": 116, "z": 19, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c20-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 640, "w": 340, "h": 24, "z": 20, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran Guru"}}, {"id": "c21-notes", "type": "NOTES", "x": 414, "y": 670, "w": 340, "h": 286, "z": 21, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"label": "Catatan & Saran Guru", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c22-divider", "type": "DIVIDER", "x": 40, "y": 964, "w": 714, "h": 4, "z": 22, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c23-signatures", "type": "SIGNATURES", "x": 40, "y": 976, "w": 714, "h": 104, "z": 23, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c24-footer", "type": "FOOTER", "x": 40, "y": 1086, "w": 714, "h": 22, "z": 24, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb, false
where not exists (
  select 1 from public.report_templates where tenant_id is null and name = 'Raport 2 Kolom'
);

update public.report_templates
   set description = 'Contoh lengkap dua kolom dalam satu halaman: kiri identitas, rekap nilai & presensi; kanan capaian, keterangan predikat & catatan guru.',
       paper = 'A4',
       orientation = 'PORTRAIT',
       layout = '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 178, "w": 714, "h": 32, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 212, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c9-semester", "type": "SEMESTER", "x": 40, "y": 230, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 262, "w": 340, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 292, "w": 340, "h": 112, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 420, "w": 340, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c13-score_table", "type": "SCORE_TABLE", "x": 40, "y": 450, "w": 340, "h": 330, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID"]}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 796, "w": 340, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c15-attendance", "type": "ATTENDANCE", "x": 40, "y": 826, "w": 340, "h": 130, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c16-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 262, "w": 340, "h": 24, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Capaian Periode Ini"}}, {"id": "c17-achievement_summary", "type": "ACHIEVEMENT_SUMMARY", "x": 414, "y": 292, "w": 340, "h": 170, "z": 17, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c18-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 478, "w": 340, "h": 24, "z": 18, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Keterangan Predikat"}}, {"id": "c19-grade_legend", "type": "GRADE_LEGEND", "x": 414, "y": 508, "w": 340, "h": 116, "z": 19, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c20-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 640, "w": 340, "h": 24, "z": 20, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran Guru"}}, {"id": "c21-notes", "type": "NOTES", "x": 414, "y": 670, "w": 340, "h": 286, "z": 21, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {"label": "Catatan & Saran Guru", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c22-divider", "type": "DIVIDER", "x": 40, "y": 964, "w": 714, "h": 4, "z": 22, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c23-signatures", "type": "SIGNATURES", "x": 40, "y": 976, "w": 714, "h": 104, "z": 23, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c24-footer", "type": "FOOTER", "x": 40, "y": 1086, "w": 714, "h": 22, "z": 24, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb,
       is_active = true,
       version = version + 1,
       updated_at = now()
 where tenant_id is null
   and name = 'Raport 2 Kolom';

insert into public.report_templates (tenant_id, name, description, paper, orientation, layout, is_primary)
select null, 'Raport Fleksibel (2 Halaman)', 'Dua halaman: halaman 1 identitas, guru pembina & rekap nilai lengkap; halaman 2 lampiran presensi, capaian, catatan & pengesahan.', 'A4', 'PORTRAIT', '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 180, "w": 714, "h": 34, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 19, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 216, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c9-period", "type": "PERIOD", "x": 40, "y": 234, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 278, "w": 340, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 308, "w": 340, "h": 120, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 278, "w": 340, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Guru Pembina"}}, {"id": "c13-teacher_identity", "type": "TEACHER_IDENTITY", "x": 414, "y": 308, "w": 340, "h": 120, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showId": true}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 450, "w": 714, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c15-score_table", "type": "SCORE_TABLE", "x": 40, "y": 480, "w": 714, "h": 420, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID", "TARGET", "TUGAS"]}}, {"id": "c16-grade_legend", "type": "GRADE_LEGEND", "x": 414, "y": 920, "w": 340, "h": 116, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c17-student_photo", "type": "STUDENT_PHOTO", "x": 40, "y": 920, "w": 96, "h": 120, "z": 17, "locked": false, "hidden": false, "style": {"borderColor": "#cbd5e1", "radius": 8}, "props": {"size": "3 x 4"}}, {"id": "c18-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 18, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}, {"components": [{"id": "c1-custom_text", "type": "CUSTOM_TEXT", "x": 40, "y": 48, "w": 714, "h": 32, "z": 1, "locked": false, "hidden": false, "style": {"fontSize": 16, "bold": true, "align": "center", "color": "#1d4ed8"}, "props": {"text": "LAMPIRAN RAPORT"}}, {"id": "c2-divider", "type": "DIVIDER", "x": 40, "y": 86, "w": 714, "h": 6, "z": 2, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c3-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 116, "w": 340, "h": 24, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c4-attendance", "type": "ATTENDANCE", "x": 40, "y": 146, "w": 340, "h": 150, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c5-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 116, "w": 340, "h": 24, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Capaian Periode Ini"}}, {"id": "c6-achievement_summary", "type": "ACHIEVEMENT_SUMMARY", "x": 414, "y": 146, "w": 340, "h": 150, "z": 6, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c7-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 326, "w": 714, "h": 24, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran"}}, {"id": "c8-notes", "type": "NOTES", "x": 40, "y": 356, "w": 714, "h": 260, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"label": "Catatan & Saran", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c9-divider", "type": "DIVIDER", "x": 40, "y": 652, "w": 714, "h": 4, "z": 9, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c10-signatures", "type": "SIGNATURES", "x": 40, "y": 676, "w": 714, "h": 120, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c11-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 824, "w": 340, "h": 24, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Kepala Lembaga"}}, {"id": "c12-head_identity", "type": "HEAD_IDENTITY", "x": 414, "y": 854, "w": 340, "h": 80, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showId": true}}, {"id": "c13-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb, false
where not exists (
  select 1 from public.report_templates where tenant_id is null and name = 'Raport Fleksibel (2 Halaman)'
);

update public.report_templates
   set description = 'Dua halaman: halaman 1 identitas, guru pembina & rekap nilai lengkap; halaman 2 lampiran presensi, capaian, catatan & pengesahan.',
       paper = 'A4',
       orientation = 'PORTRAIT',
       layout = '{"pages": [{"components": [{"id": "c1-box", "type": "BOX", "x": 40, "y": 32, "w": 714, "h": 120, "z": 1, "locked": false, "hidden": false, "style": {"background": "#eff6ff", "borderColor": "#dbeafe", "radius": 14}, "props": {}}, {"id": "c2-logo", "type": "LOGO", "x": 54, "y": 44, "w": 96, "h": 96, "z": 2, "locked": false, "hidden": false, "style": {}, "props": {}}, {"id": "c3-institution_name", "type": "INSTITUTION_NAME", "x": 166, "y": 48, "w": 470, "h": 30, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 18, "bold": true, "align": "left"}, "props": {}}, {"id": "c4-institution_address", "type": "INSTITUTION_ADDRESS", "x": 166, "y": 80, "w": 470, "h": 24, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "left"}, "props": {}}, {"id": "c5-institution_contact", "type": "INSTITUTION_CONTACT", "x": 166, "y": 104, "w": 470, "h": 20, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "left"}, "props": {}}, {"id": "c6-divider", "type": "DIVIDER", "x": 40, "y": 160, "w": 714, "h": 6, "z": 6, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c7-report_title", "type": "REPORT_TITLE", "x": 40, "y": 180, "w": 714, "h": 34, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 19, "bold": true, "align": "center"}, "props": {}}, {"id": "c8-academic_year", "type": "ACADEMIC_YEAR", "x": 40, "y": 216, "w": 714, "h": 18, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c9-period", "type": "PERIOD", "x": 40, "y": 234, "w": 714, "h": 18, "z": 9, "locked": false, "hidden": false, "style": {"fontSize": 10, "align": "center"}, "props": {}}, {"id": "c10-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 278, "w": 340, "h": 24, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Identitas Santri"}}, {"id": "c11-student_identity", "type": "STUDENT_IDENTITY", "x": 40, "y": 308, "w": 340, "h": 120, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"fields": ["name", "id", "class", "halaqah"]}}, {"id": "c12-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 278, "w": 340, "h": 24, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Guru Pembina"}}, {"id": "c13-teacher_identity", "type": "TEACHER_IDENTITY", "x": 414, "y": 308, "w": 340, "h": 120, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showId": true}}, {"id": "c14-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 450, "w": 714, "h": 24, "z": 14, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekapitulasi Nilai"}}, {"id": "c15-score_table", "type": "SCORE_TABLE", "x": 40, "y": 480, "w": 714, "h": 420, "z": 15, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"modules": ["TAHFIDZ", "TARTIL", "SETORAN", "HADITS", "DOA", "TAJWID", "TARGET", "TUGAS"]}}, {"id": "c16-grade_legend", "type": "GRADE_LEGEND", "x": 414, "y": 920, "w": 340, "h": 116, "z": 16, "locked": false, "hidden": false, "style": {"fontSize": 10}, "props": {}}, {"id": "c17-student_photo", "type": "STUDENT_PHOTO", "x": 40, "y": 920, "w": 96, "h": 120, "z": 17, "locked": false, "hidden": false, "style": {"borderColor": "#cbd5e1", "radius": 8}, "props": {"size": "3 x 4"}}, {"id": "c18-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 18, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}, {"components": [{"id": "c1-custom_text", "type": "CUSTOM_TEXT", "x": 40, "y": 48, "w": 714, "h": 32, "z": 1, "locked": false, "hidden": false, "style": {"fontSize": 16, "bold": true, "align": "center", "color": "#1d4ed8"}, "props": {"text": "LAMPIRAN RAPORT"}}, {"id": "c2-divider", "type": "DIVIDER", "x": 40, "y": 86, "w": 714, "h": 6, "z": 2, "locked": false, "hidden": false, "style": {"borderColor": "#1d4ed8"}, "props": {"thickness": 3}}, {"id": "c3-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 116, "w": 340, "h": 24, "z": 3, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Rekap Presensi"}}, {"id": "c4-attendance", "type": "ATTENDANCE", "x": 40, "y": 146, "w": 340, "h": 150, "z": 4, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c5-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 116, "w": 340, "h": 24, "z": 5, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Capaian Periode Ini"}}, {"id": "c6-achievement_summary", "type": "ACHIEVEMENT_SUMMARY", "x": 414, "y": 146, "w": 340, "h": 150, "z": 6, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {}}, {"id": "c7-section_heading", "type": "SECTION_HEADING", "x": 40, "y": 326, "w": 714, "h": 24, "z": 7, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Catatan & Saran"}}, {"id": "c8-notes", "type": "NOTES", "x": 40, "y": 356, "w": 714, "h": 260, "z": 8, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"label": "Catatan & Saran", "text": "Ananda menunjukkan perkembangan hafalan yang stabil dan tertib mengikuti halaqah. Bacaan makhraj sudah baik, perlu penguatan pada hukum mad dan kelancaran muroja''ah juz sebelumnya. Mohon dukungan orang tua untuk membiasakan muroja''ah 15 menit setiap ba''da Maghrib."}}, {"id": "c9-divider", "type": "DIVIDER", "x": 40, "y": 652, "w": 714, "h": 4, "z": 9, "locked": false, "hidden": false, "style": {"borderColor": "#dbeafe"}, "props": {"thickness": 1}}, {"id": "c10-signatures", "type": "SIGNATURES", "x": 40, "y": 676, "w": 714, "h": 120, "z": 10, "locked": false, "hidden": false, "style": {"fontSize": 12}, "props": {"showTeacher": true, "showHead": true}}, {"id": "c11-section_heading", "type": "SECTION_HEADING", "x": 414, "y": 824, "w": 340, "h": 24, "z": 11, "locked": false, "hidden": false, "style": {"fontSize": 11, "color": "#1d4ed8", "borderColor": "#dbeafe"}, "props": {"text": "Kepala Lembaga"}}, {"id": "c12-head_identity", "type": "HEAD_IDENTITY", "x": 414, "y": 854, "w": 340, "h": 80, "z": 12, "locked": false, "hidden": false, "style": {"fontSize": 11}, "props": {"showId": true}}, {"id": "c13-footer", "type": "FOOTER", "x": 40, "y": 1084, "w": 714, "h": 22, "z": 13, "locked": false, "hidden": false, "style": {"fontSize": 9, "align": "center"}, "props": {}}]}]}'::jsonb,
       is_active = true,
       version = version + 1,
       updated_at = now()
 where tenant_id is null
   and name = 'Raport Fleksibel (2 Halaman)';

-- Tandai "Raport 2 Kolom" sebagai contoh utama bawaan platform.
update public.report_templates set is_primary = false
 where tenant_id is null and is_primary
   and name <> 'Raport 2 Kolom';

update public.report_templates set is_primary = true
 where tenant_id is null and name = 'Raport 2 Kolom';

-- Lembaga yang sudah punya salinan template tapi belum menunjuk raport utama:
-- pakai template aktif paling lama sebagai default agar UI tidak kosong.
update public.report_templates t set is_primary = true
where t.tenant_id is not null
  and t.is_active
  and not exists (
    select 1 from public.report_templates p
    where p.tenant_id = t.tenant_id and p.is_primary
  )
  and t.id = (
    select t2.id from public.report_templates t2
    where t2.tenant_id = t.tenant_id and t2.is_active
    order by t2.created_at, t2.id
    limit 1
  );
