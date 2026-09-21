/**
 * TAHFIZH V18 — Pantauan Santri (SERVER ONLY).
 *
 * Pembungkus tipis untuk RPC V18. Semua RPC SECURITY DEFINER dan sudah
 * memfilter anak milik akun ini di tenant-nya sendiri, jadi tidak ada
 * parameter identitas yang dikirim dari klien.
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  PantauanItem,
  PresensiRekap,
  PrestasiCard,
  RaportItem,
  TargetProgress,
} from "@/lib/santri-pantauan-shared";

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) {
    console.error(`[${name}]`, error.message);
    return [];
  }
  return (data ?? []) as T[];
}

export function getPrestasiCards() {
  return rpc<PrestasiCard>("santri_prestasi_card");
}

export function getPantauanFeed(studentId?: string | null, limit = 60) {
  return rpc<PantauanItem>("santri_pantauan_feed", {
    p_student_id: studentId || null,
    p_limit: limit,
  });
}

export function getPresensiRekap(months = 6) {
  return rpc<PresensiRekap>("santri_presensi_rekap", { p_months: months });
}

export function getTargetProgress() {
  return rpc<TargetProgress>("santri_target_progress");
}

export function getRaportList() {
  return rpc<RaportItem>("santri_raport_list");
}
