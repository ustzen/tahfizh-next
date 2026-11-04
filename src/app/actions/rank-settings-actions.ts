"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { ActionResult } from "@/app/actions/crud";
import {
  RANK_MODULES,
  validateGradeScale,
  type GradeBand,
} from "@/lib/rank-settings-shared";

/**
 * TAHFIZH V78 — Simpan / reset kriteria peringkat & skala nilai huruf guru.
 * Penyimpanan atomik lewat RPC teacher_rank_settings_save (validasi ganda:
 * di sini dan di database).
 */

const VALID_MODULES = new Set<string>(RANK_MODULES.map((m) => m.key));

const RPC_ERRORS: Record<string, string> = {
  MODUL_KOSONG: "Pilih minimal 1 kriteria peringkat.",
  MODUL_TIDAK_VALID: "Ada kriteria yang tidak dikenal.",
  SKALA_TIDAK_VALID: "Skala nilai tidak valid. Periksa nama dan rentang angkanya.",
  SKALA_TUMPANG_TINDIH: "Ada rentang nilai yang saling tumpang tindih.",
  LABEL_GANDA: "Ada nama nilai yang dipakai dua kali.",
  AKSES_DITOLAK: "Akses ditolak.",
};

function mapRpcError(message: string, fallback: string): string {
  for (const [code, text] of Object.entries(RPC_ERRORS)) {
    if (message.includes(code)) return text;
  }
  return fallback;
}

export async function saveRankSettingsAction(input: {
  modules: string[];
  grades: GradeBand[];
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") return { error: "Akses ditolak." };

  const modules = Array.from(new Set(input.modules ?? [])).filter((m) => VALID_MODULES.has(m));
  if (modules.length === 0) return { error: "Pilih minimal 1 kriteria peringkat." };

  const grades = (input.grades ?? []).map((g) => ({
    label: String(g.label ?? "").trim(),
    // V86 — batas boleh 1 desimal (mis. 95,9); bulatkan ke 0,1 terdekat.
    min: Math.round(Number(g.min) * 10) / 10,
    max: Math.round(Number(g.max) * 10) / 10,
  }));
  const invalid = validateGradeScale(grades);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.rpc("teacher_rank_settings_save", {
    p_modules: modules,
    p_grades: grades,
  });
  if (error) {
    console.error("[teacher_rank_settings_save]", error.message);
    return { error: mapRpcError(error.message, "Gagal menyimpan pengaturan. Coba lagi.") };
  }

  revalidatePath("/ustadz/santri");
  return { success: "Pengaturan peringkat & nilai disimpan." };
}

export async function resetRankSettingsAction(): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") return { error: "Akses ditolak." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("teacher_rank_settings_reset");
  if (error) {
    console.error("[teacher_rank_settings_reset]", error.message);
    return { error: mapRpcError(error.message, "Gagal mengembalikan default. Coba lagi.") };
  }

  revalidatePath("/ustadz/santri");
  return { success: "Pengaturan dikembalikan ke default." };
}
