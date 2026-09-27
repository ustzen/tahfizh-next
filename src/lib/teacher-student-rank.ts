import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TeacherStudentRank } from "@/lib/santri-pantauan-shared";

/**
 * TAHFIZH V45 — Peringkat + skor tiap santri di halaqahnya untuk menu
 * Data Santri guru (RPC SECURITY DEFINER `teacher_students_rank`).
 * Pemointan sama dengan peringkat Kartu Prestasi (V44).
 * Gagal/kosong → Map kosong; tabel tetap tampil tanpa kolom peringkat aktif.
 */
export const getTeacherStudentRanks = cache(async (): Promise<Map<string, TeacherStudentRank>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_students_rank");
  if (error) {
    console.error("[teacher_students_rank]", error.message);
    return new Map();
  }
  const rows = (data ?? []) as unknown as TeacherStudentRank[];
  return new Map(rows.map((r) => [r.studentId, r]));
});
