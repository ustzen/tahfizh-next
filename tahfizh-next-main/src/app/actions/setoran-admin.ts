"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateSetoranConfig } from "@/lib/cache";
import { SUBMISSION_NOTE_SLOTS, type SubmissionNoteSlot } from "@/lib/setoran";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V5 — ADMIN Setoran configuration: template catatan (rule #15-#17).
 * Role re-read from the session on every call; tenant-scoped only.
 * Guru only READS templates (RLS) — writes are admin-only (rule #17/#55).
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return null;
  return profile;
}

export async function createSubmissionTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const slot = String(formData.get("slot") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!(SUBMISSION_NOTE_SLOTS as readonly string[]).includes(slot)) {
    return { error: "Bagian template tidak valid." };
  }
  if (content.length < 1 || content.length > 300) {
    return { error: "Isi template harus 1-300 karakter." };
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tahfidz_submission_templates")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("tahfidz_submission_templates").insert({
    tenant_id: profile.tenantId,
    slot: slot as SubmissionNoteSlot,
    content,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return { error: "Gagal menambah template." };

  invalidateSetoranConfig(profile.tenantCode);
  return { success: "Template ditambahkan." };
}

export async function updateSubmissionTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!UUID_RE.test(id)) return { error: "Template tidak valid." };
  if (content.length < 1 || content.length > 300) {
    return { error: "Isi template harus 1-300 karakter." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tahfidz_submission_templates")
    .update({ content })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah template." };

  invalidateSetoranConfig(profile.tenantCode);
  return { success: "Template diperbarui." };
}

export async function setSubmissionTemplateActiveAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!UUID_RE.test(id)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tahfidz_submission_templates")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status template." };

  invalidateSetoranConfig(profile.tenantCode);
  return { success: isActive ? "Template diaktifkan." : "Template dinonaktifkan." };
}

export async function reorderSubmissionTemplatesAction(orderIds: string[]): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 50) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("tahfidz_submission_templates")
    .select("id")
    .eq("tenant_id", profile.tenantId);
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase
    .from("tahfidz_submission_templates")
    .upsert(updates, { onConflict: "id" });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateSetoranConfig(profile.tenantCode);
  return { success: "Urutan template tersimpan." };
}
