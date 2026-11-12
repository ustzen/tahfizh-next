"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

export type TmOnDate = { no: number; ada: boolean; beda: boolean } | null;

/**
 * TM untuk sekumpulan santri pada satu tanggal (dipakai Tartil massal).
 * Satu nomor → tampil biasa; bila santri berbeda halaqah dan nomornya berbeda,
 * `no` = nomor terkecil dan `beda` = true.
 */
export async function getTmOnDateAction(studentIds: string[], date: string): Promise<TmOnDate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || studentIds.length === 0) return null;
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tm_for_students_on_date", {
    p_student_ids: studentIds,
    p_date: date,
  });
  if (error) {
    console.error("[tm_for_students_on_date]", error.message);
    return null;
  }
  const rows = (data ?? []) as { r_tm: number | null; r_ada: boolean }[];
  const nos = rows.map((r) => r.r_tm).filter((n): n is number => typeof n === "number");
  if (nos.length === 0) return null;
  return {
    no: Math.min(...nos),
    ada: rows.every((r) => r.r_ada),
    beda: new Set(nos).size > 1,
  };
}
