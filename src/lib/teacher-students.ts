import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V12.10 — Daftar santri binaan guru (kolom lengkap).
 *
 * Sumber utama: RPC SECURITY DEFINER `teacher_students_list` (guru hanya
 * binaannya). Bila RPC gagal/kosong, fallback membaca jalur halaqah secara
 * per-langkah: teachers → halaqah_teachers → halaqah_students → students
 * (embed antar tabel TIDAK dipakai karena halaqah_teachers dan
 * halaqah_students tidak terhubung FK langsung). Semua tabel punya policy RLS
 * per tenant, jadi guru tetap hanya melihat santri halaqahnya.
 */

export type TeacherStudentRow = {
  id: string | null;
  business_code: string | null;
  nis: string | null;
  nisn: string | null;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  guardian_name: string | null;
  guardian_whatsapp: string | null;
  halaqah_name: string | null;
};

type FbStudent = {
  id: string;
  nis: string | null;
  nisn: string | null;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  guardian_name: string | null;
  guardian_whatsapp: string | null;
};

type FbMembership = {
  halaqah_id: string;
  left_at: string | null;
  students: FbStudent | null;
};

/** Normalisasi nama untuk pencocokan guru↔profil: huruf kecil, tanpa spasi/titik/titel umum. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ust|ustadz|ustadzah|ust|u(dd|dz)|h|haj[iy]|dr|kh|ki)\b\.?/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export const getTeacherStudentsDetailed = cache(async (): Promise<TeacherStudentRow[]> => {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId || !profile.fullName) return [];
  const supabase = await createClient();

  const rpc = await supabase.rpc("teacher_students_list");
  if (!rpc.error && rpc.data && (rpc.data as unknown[]).length > 0) {
    return rpc.data as unknown as TeacherStudentRow[];
  }
  if (rpc.error) console.error("[teacher_students_list]", rpc.error.message);

  // ---- Fallback (kueri per-langkah, semua tenant-scoped oleh RLS) ----------

  // 1. Temukan baris guru milik profil ini (V12.11: link UUID dulu, lalu nama
  //    persis, lalu nama ternormalisasi untuk data lama yang belum ter-backfill).
  let teacherIds: string[] = [];
  const byId = await supabase
    .from("teachers")
    .select("id, full_name")
    .eq("tenant_id", profile.tenantId)
    .eq("profile_id", profile.id)
    .limit(5);
  if (!byId.error && byId.data && byId.data.length > 0) {
    teacherIds = byId.data.map((t) => t.id);
  } else {
    const exact = await supabase
      .from("teachers")
      .select("id, full_name")
      .eq("tenant_id", profile.tenantId)
      .ilike("full_name", profile.fullName)
      .limit(5);
    if (!exact.error && exact.data && exact.data.length > 0) {
      teacherIds = exact.data.map((t) => t.id);
    } else {
      const wanted = normalizeName(profile.fullName);
      if (wanted) {
        const all = await supabase
          .from("teachers")
          .select("id, full_name")
          .eq("tenant_id", profile.tenantId)
          .limit(500);
        teacherIds = (all.data ?? [])
          .filter((t) => normalizeName(t.full_name) === wanted)
          .map((t) => t.id);
      }
    }
  }
  if (teacherIds.length === 0) return [];

  // 2. Halaqah yang diampu guru-guru tersebut.
  const hts = await supabase
    .from("halaqah_teachers")
    .select("halaqah_id")
    .in("teacher_id", teacherIds);
  if (hts.error) {
    console.error("[students-fallback: halaqah_teachers]", hts.error.message);
    return [];
  }
  const halaqahIds = [...new Set((hts.data ?? []).map((r) => r.halaqah_id))];
  if (halaqahIds.length === 0) return [];

  // 3. Nama halaqah (untuk kolom Halaqah).
  const hNames = await supabase
    .from("halaqahs")
    .select("id, name")
    .in("id", halaqahIds);
  const nameById = new Map((hNames.data ?? []).map((h) => [h.id, h.name]));
  if (hNames.error) console.error("[students-fallback: halaqahs]", hNames.error.message);

  // 4. Anggota aktif halaqah + data santri (embed FK halaqah_students→students valid).
  const ms = await supabase
    .from("halaqah_students")
    .select(
      "halaqah_id, left_at, students!inner(id, nis, nisn, full_name, nickname, gender, status, guardian_name, guardian_whatsapp)"
    )
    .in("halaqah_id", halaqahIds)
    .is("left_at", null);
  if (ms.error) {
    console.error("[students-fallback: halaqah_students]", ms.error.message);
    return [];
  }

  const byStudent = new Map<string, TeacherStudentRow>();
  for (const row of (ms.data ?? []) as unknown as FbMembership[]) {
    const st = row.students as FbStudent | null;
    if (!st || byStudent.has(st.id)) continue; // santri sama di >1 halaqah → tampil sekali
    byStudent.set(st.id, {
      id: st.id,
      business_code: null,
      nis: st.nis,
      nisn: st.nisn,
      full_name: st.full_name,
      nickname: st.nickname,
      gender: st.gender,
      status: st.status,
      guardian_name: st.guardian_name,
      guardian_whatsapp: st.guardian_whatsapp,
      halaqah_name: nameById.get(row.halaqah_id) ?? null,
    });
  }

  return [...byStudent.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
});
