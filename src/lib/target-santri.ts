import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  groupSantriTargets,
  isTargetCategory,
  isTargetScope,
  type SantriTargetGroup,
  type SantriTargetRow,
  type TargetStudentOption,
} from "@/lib/target-shared";

/**
 * TAHFIZH V70 — Target per santri (SERVER ONLY).
 *
 * Identitas (tenant/guru) selalu diverifikasi di dalam RPC SECURITY DEFINER
 * `target_santri_overview` — binaan sang guru + baris target per santri
 * (maks 1 baris per santri per jenis; menimpa target halaqah).
 */

type RawStudentTarget = {
  id: string;
  studentId: string;
  studentName: string;
  halaqahName: string | null;
  category: string;
  scope: string;
  items: string | null;
  itemIds: string[] | null;
  targetValue: number | string;
  description: string | null;
  updatedAt: string;
};

export type SantriTargetOverview = {
  binaan: TargetStudentOption[];
  targets: SantriTargetRow[];
  groups: SantriTargetGroup[];
};

const EMPTY: SantriTargetOverview = { binaan: [], targets: [], groups: [] };

export async function getSantriTargetOverview(): Promise<SantriTargetOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_santri_overview");
  if (error || !data) {
    if (error) console.error("target_santri_overview failed:", error.message);
    return EMPTY;
  }

  const raw = data as { binaan?: { id: string; name: string; halaqahName: string }[]; targets?: RawStudentTarget[] };

  const binaan: TargetStudentOption[] = (raw.binaan ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    halaqahName: b.halaqahName,
  }));

  const targets: SantriTargetRow[] = [];
  for (const t of raw.targets ?? []) {
    if (!isTargetCategory(t.category) || !isTargetScope(t.scope)) continue; // abaikan nilai tak dikenal
    const itemNames = (t.items ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    targets.push({
      id: t.id,
      studentId: t.studentId,
      studentName: t.studentName,
      halaqahName: t.halaqahName ?? null,
      category: t.category,
      scope: t.scope,
      items: itemNames,
      itemIds: Array.isArray(t.itemIds) ? t.itemIds : [],
      targetValue: Number(t.targetValue ?? 0),
      description: t.description ?? null,
      updatedAt: t.updatedAt,
    });
  }

  return { binaan, targets, groups: groupSantriTargets(targets) };
}
