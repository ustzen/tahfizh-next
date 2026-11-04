-- ============================================================================
-- TAHFIZH V84 — TARTIL: guru bisa menghapus nilai yang salah isi (binaan)
-- ============================================================================
-- Masalah: di Penilaian Massal, nilai santri yang terlanjur diisi (mis. santri
-- ternyata tidak berangkat) tidak bisa dihapus. Selain form tidak punya tombol
-- hapus, RPC tartil_soft_delete_assessment (V4) hanya menerima nilai yang
-- teacher_id-nya cocok dengan pencarian guru lewat NAMA profil (ilike). Nilai
-- yang ditampilkan di form massal (V76) mencakup seluruh santri binaan, jadi
-- nilai milik guru lain / yang dicatat akun ini tapi beda penulisan nama
-- ditolak dengan AKSES_DITOLAK.
--
-- Perbaikan: resolusi guru sama seperti V76/V77 (link profile_id dulu, nama
-- sebagai cadangan), dan penghapusan diizinkan bila nilai itu:
--   • milik guru ini (teacher_id), atau
--   • dicatat oleh akun ini (assessed_by), atau
--   • milik santri binaan guru ini (halaqah diampu / teacher_students).
-- Tetap soft delete (deleted_at) — riwayat & Kartu Prestasi tetap konsisten.
-- Trigger V77 melewati soft delete, jadi santri berstatus tidak hadir pun bisa
-- dihapus nilainya. Idempoten.
-- ============================================================================

create or replace function public.tartil_soft_delete_assessment(p_assessment_id uuid)
returns void
language plpgsql
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

  update public.tartil_assessments a set
    deleted_at = now(),
    deleted_by = v_uid
  where a.id = p_assessment_id
    and a.tenant_id = v_tenant
    and a.deleted_at is null
    and (
      a.teacher_id = v_teacher
      or a.assessed_by = v_uid
      or a.student_id in (
        select hs.student_id
        from public.halaqah_teachers ht
        join public.halaqah_students hs
          on hs.halaqah_id = ht.halaqah_id and hs.left_at is null
        where ht.teacher_id = v_teacher
        union
        select ts.student_id
        from public.teacher_students ts
        where ts.teacher_id = v_teacher
      )
    );

  if not found then
    raise exception 'PENILAIAN_TIDAK_DITEMUKAN';
  end if;
end;
$$;

revoke execute on function public.tartil_soft_delete_assessment(uuid) from public;
grant execute on function public.tartil_soft_delete_assessment(uuid) to authenticated;
