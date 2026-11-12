/**
 * TM (Tatap Muka) — query server (SERVER ONLY). Pembungkus RPC V88.
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Semua tanggal sesi presensi sebuah halaqah, urut naik (YYYY-MM-DD). */
export async function getTmSessionDates(halaqahId: string): Promise<string[]> {
  if (!halaqahId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tm_session_dates", { p_halaqah_id: halaqahId });
  if (error) {
    console.error("[tm_session_dates]", error.message);
    return [];
  }
  return ((data ?? []) as string[]).map(String);
}

/** TM per tanggal untuk satu santri (kunci = YYYY-MM-DD). Tanggal tanpa sesi tidak ikut. */
export async function getTmForStudentDates(
  studentId: string,
  dates: string[]
): Promise<Record<string, number>> {
  const uniq = Array.from(new Set(dates.filter(Boolean)));
  if (uniq.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tm_for_student_dates", {
    p_student_id: studentId,
    p_dates: uniq,
  });
  if (error) {
    console.error("[tm_for_student_dates]", error.message);
    return {};
  }
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { r_date: string; r_tm: number | null }[]) {
    if (r.r_tm) out[String(r.r_date)] = r.r_tm;
  }
  return out;
}
