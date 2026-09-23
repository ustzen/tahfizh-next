-- ============================================================================
-- TAHFIZH V16 — Perbaikan akar masalah: akun santri tidak pernah tertaut
-- sebagai "wali" dari dirinya sendiri, sehingga menu Infak Pengembangan,
-- "Data Saya", dan dasbor santri selalu tampil kosong walau akun itu jelas
-- sudah tertaut ke datanya sendiri lewat students.login_username.
-- ============================================================================
-- AKAR MASALAH:
--   Fitur wali (guardians + guardian_students) dipakai untuk membaca data di
--   /santri/infak, /santri/anak, dan dasbor /santri — TAPI tidak ada satu pun
--   jalur kode (buat guru/santri manual, import Excel, seed dummy) yang
--   pernah MENULIS ke tabel guardians/guardian_students. Akibatnya semua akun
--   santri di seluruh lembaga tampil "belum terhubung", bukan hanya kasus
--   tertentu.
--
-- PERBAIKAN (dua lapis, bukan hanya kode aplikasi — supaya berlaku untuk
-- SEMUA jalur, termasuk yang mungkin lupa ter-cover di lapisan aplikasi):
--   1. TRIGGER pada public.students: begitu login_username terisi/berubah,
--      akun (profiles, role WALI_SANTRI) dengan username yang sama otomatis
--      dijadikan "wali dari dirinya sendiri" — guardians + guardian_students
--      dibuat otomatis, tanpa langkah admin manual apa pun.
--   2. BACKFILL satu kali untuk seluruh santri yang SUDAH punya akun login
--      sebelum migrasi ini (termasuk akun yang sudah dipakai user sekarang).
--
-- Idempoten & repair-safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: tautkan otomatis begitu login_username terisi/berubah
-- ---------------------------------------------------------------------------
create or replace function public.students_self_guardian_link()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile_id  uuid;
  v_guardian_id uuid;
begin
  if new.login_username is null or new.login_username = '' then
    return new;
  end if;
  -- UPDATE lain (nilai/presensi, dst.) yang tidak menyentuh login_username
  -- tidak perlu memicu ulang — hemat kerja pada trigger yang sering jalan.
  if tg_op = 'UPDATE' and old.login_username is not distinct from new.login_username then
    return new;
  end if;

  select id into v_profile_id
  from public.profiles
  where username = new.login_username
    and tenant_id = new.tenant_id
    and role = 'WALI_SANTRI'
  limit 1;

  -- Profil belum ada (race jarang terjadi karena profiles selalu dibuat lebih
  -- dulu oleh createLoginAccount) — backfill di bawah akan menyusulkan nanti
  -- bila perlu; tidak menggagalkan penyimpanan data santri.
  if v_profile_id is null then
    return new;
  end if;

  insert into public.guardians (tenant_id, profile_id)
  values (new.tenant_id, v_profile_id)
  on conflict (profile_id) do nothing;

  select id into v_guardian_id from public.guardians where profile_id = v_profile_id;

  if v_guardian_id is not null then
    insert into public.guardian_students (tenant_id, guardian_id, student_id)
    values (new.tenant_id, v_guardian_id, new.id)
    on conflict (guardian_id, student_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists students_self_guardian_link_trg on public.students;
create trigger students_self_guardian_link_trg
  after insert or update of login_username on public.students
  for each row execute function public.students_self_guardian_link();

-- ---------------------------------------------------------------------------
-- 2. Backfill — santri yang sudah punya akun SEBELUM migrasi ini ada
-- ---------------------------------------------------------------------------
insert into public.guardians (tenant_id, profile_id)
select distinct s.tenant_id, p.id
from public.students s
join public.profiles p
  on p.username = s.login_username
 and p.tenant_id = s.tenant_id
 and p.role = 'WALI_SANTRI'
where s.login_username is not null and s.login_username <> ''
on conflict (profile_id) do nothing;

insert into public.guardian_students (tenant_id, guardian_id, student_id)
select s.tenant_id, g.id, s.id
from public.students s
join public.profiles p
  on p.username = s.login_username
 and p.tenant_id = s.tenant_id
 and p.role = 'WALI_SANTRI'
join public.guardians g on g.profile_id = p.id
where s.login_username is not null and s.login_username <> ''
on conflict (guardian_id, student_id) do nothing;
