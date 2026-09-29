import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * TAHFIZH V52 — Rekap ibadah per santri (SERVER ONLY).
 *
 * Pembungkus RPC `ibadah_rekap_guru`: agregat centang jurnal ibadah 30 hari
 * terakhir per santri dalam lingkup pemanggil (guru = halaqah diampu,
 * admin/koordinator = seluruh lembaga). Error → kosong (RPC V52 mungkin belum
 * dijalankan di database lembaga).
 */
export type IbadahRekapRow = {
  studentId: string;
  studentName: string;
  halaqahName: string | null;
  totalDone: number;
  activeDays: number;
  activityRatio: number;
  perActivity: Record<string, number>;
  lastLogDate: string | null;
};

export const getIbadahRekapGuru = cache(async (days = 30): Promise<IbadahRekapRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ibadah_rekap_guru", { p_days: days });
  if (error) {
    console.error("[ibadah_rekap_guru]", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: String(r.student_id ?? ""),
    studentName: String(r.student_name ?? ""),
    halaqahName: (r.halaqah_name as string | null) ?? null,
    totalDone: Number(r.total_done ?? 0),
    activeDays: Number(r.active_days ?? 0),
    activityRatio: Number(r.activity_ratio ?? 0),
    perActivity: (r.per_activity as Record<string, number>) ?? {},
    lastLogDate: (r.last_log_date as string | null) ?? null,
  }));
});
