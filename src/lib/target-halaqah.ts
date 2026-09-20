import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isTargetCategory,
  type HalaqahTarget,
  type TargetHalaqah,
  type TargetOverview,
} from "@/lib/target-shared";

/**
 * TAHFIZH V17 — Target per halaqah (SERVER ONLY).
 *
 * Identitas (tenant/guru) selalu dari session di dalam RPC SECURITY DEFINER
 * `target_halaqah_overview` — bukan dari client. Hasil: halaqah aktif yang
 * diampu guru + target (maks. 3 jenis per halaqah).
 */

type RawHalaqah = { id: string; name: string; studentCount?: number | string | null };
type RawTarget = {
  id: string;
  halaqahId: string;
  category: string;
  targetValue: number | string;
  startDate: string;
  endDate: string;
  description: string | null;
  updatedAt: string;
};

const EMPTY: TargetOverview = { halaqah: [], targets: [] };

export async function getTargetOverview(): Promise<TargetOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_halaqah_overview");
  if (error || !data) {
    if (error) console.error("target_halaqah_overview failed:", error.message);
    return EMPTY;
  }

  const raw = data as { halaqah?: RawHalaqah[]; targets?: RawTarget[] };

  const halaqah: TargetHalaqah[] = (raw.halaqah ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    studentCount: Number(h.studentCount ?? 0),
  }));

  const targets: HalaqahTarget[] = [];
  for (const t of raw.targets ?? []) {
    if (!isTargetCategory(t.category)) continue; // abaikan nilai tak dikenal
    targets.push({
      id: t.id,
      halaqahId: t.halaqahId,
      category: t.category,
      targetValue: Number(t.targetValue ?? 0),
      startDate: t.startDate,
      endDate: t.endDate,
      description: t.description ?? null,
      updatedAt: t.updatedAt,
    });
  }

  return { halaqah, targets };
}
