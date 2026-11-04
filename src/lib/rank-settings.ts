import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_GRADE_SCALE,
  DEFAULT_RANK_MODULES,
  RANK_MODULES,
  type GradeBand,
  type RankModuleKey,
  type TeacherRankSettings,
} from "@/lib/rank-settings-shared";

const VALID_MODULES = new Set<string>(RANK_MODULES.map((m) => m.key));

/**
 * TAHFIZH V78 — Pengaturan peringkat milik guru yang sedang login
 * (tabel teacher_rank_settings + teacher_grade_scales, RLS: hanya pemilik).
 * Belum ada pengaturan / tabel belum dimigrasi → pakai default.
 */
export const getTeacherRankSettings = cache(async (): Promise<TeacherRankSettings> => {
  const fallback: TeacherRankSettings = {
    modules: [...DEFAULT_RANK_MODULES],
    scale: DEFAULT_GRADE_SCALE.map((g) => ({ ...g })),
    customModules: false,
    customScale: false,
  };

  try {
    const supabase = await createClient();
    const [modRes, scaleRes] = await Promise.all([
      supabase.from("teacher_rank_settings").select("modules").maybeSingle(),
      supabase
        .from("teacher_grade_scales")
        .select("label, min_value, max_value, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    if (modRes.error) console.error("[teacher_rank_settings]", modRes.error.message);
    if (scaleRes.error) console.error("[teacher_grade_scales]", scaleRes.error.message);

    const rawModules = (modRes.data?.modules as string[] | null | undefined) ?? [];
    const modules = rawModules.filter((m): m is RankModuleKey => VALID_MODULES.has(m));
    const scale: GradeBand[] = (scaleRes.data ?? []).map((r) => ({
      label: r.label as string,
      min: Number(r.min_value),
      max: Number(r.max_value),
    }));

    return {
      modules: modules.length > 0 ? modules : fallback.modules,
      scale: scale.length > 0 ? scale : fallback.scale,
      customModules: modules.length > 0,
      customScale: scale.length > 0,
    };
  } catch (e) {
    console.error("[getTeacherRankSettings]", e);
    return fallback;
  }
});
