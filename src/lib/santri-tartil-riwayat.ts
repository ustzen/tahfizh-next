/**
 * Riwayat nilai Tartil untuk role santri/wali (SERVER ONLY).
 * Pembungkus tipis RPC santri_tartil_riwayat (V87) — SECURITY DEFINER dan
 * sudah memfilter anak milik akun ini, jadi tidak ada identitas dari klien.
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  mapTartilRiwayat,
  type TartilRiwayatItem,
  type TartilRiwayatRow,
} from "@/lib/santri-tartil-riwayat-shared";

/** Semua anak akun ini, dikelompokkan per studentId (terbaru dulu). */
export async function getSantriTartilRiwayat(): Promise<Map<string, TartilRiwayatItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("santri_tartil_riwayat", {});
  const out = new Map<string, TartilRiwayatItem[]>();
  if (error) {
    console.error("[santri_tartil_riwayat]", error.message);
    return out;
  }
  for (const row of (data ?? []) as TartilRiwayatRow[]) {
    const item = mapTartilRiwayat(row);
    const list = out.get(item.studentId);
    if (list) list.push(item);
    else out.set(item.studentId, [item]);
  }
  return out;
}
