/**
 * TAHFIZH V18 — Pantauan Santri (SERVER ONLY).
 *
 * Pembungkus tipis untuk RPC V18. Semua RPC SECURITY DEFINER dan sudah
 * memfilter anak milik akun ini di tenant-nya sendiri, jadi tidak ada
 * parameter identitas yang dikirim dari klien.
 */
import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  PantauanItem,
  PresensiRekap,
  PrestasiCard,
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

/**
 * V19 — self-heal: pastikan akun santri tertaut ke baris santri-nya sendiri.
 * Dipanggil sekali per render dari layout /santri, jadi tidak ada lagi keadaan
 * "data belum terhubung" yang harus diurus admin secara manual.
 */
export const ensureSantriSelfLink = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("santri_ensure_self_link");
  if (error) {
    console.error("[santri_ensure_self_link]", error.message);
    return 0;
  }
  return Number(data ?? 0);
});
