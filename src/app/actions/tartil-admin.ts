"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateTartilConfig } from "@/lib/cache";
import { NOTE_SLOTS, type NoteSlot } from "@/lib/tartil";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V4 — ADMIN Tartil configuration (rules #7-#8, #13-#15, #24, #30).
 * Role re-read from the session on every call; per-tenant only.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

function friendlyDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23503") {
    return "Materi ini sudah digunakan dalam penilaian. Gunakan Nonaktifkan, bukan hapus.";
  }
  if (error.code === "23505") return "Data sudah ada (duplikat).";
  return fallback;
}

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return null;
  return profile;
}

/* ------------------------------------------------------------------------ */
/* MATERI TARTIL                                                            */
/* ------------------------------------------------------------------------ */

export async function createMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const name = String(formData.get("name") ?? "").trim();
  const jilid = String(formData.get("jilid") ?? "").trim();
  const pagesLabel = String(formData.get("pagesLabel") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 1 || name.length > 80) return { error: "Nama materi harus 1-80 karakter." };
  if (jilid.length > 40) return { error: "Jilid maksimal 40 karakter." };
  if (pagesLabel.length > 60) return { error: "Halaman maksimal 60 karakter." };
  if (description.length > 300) return { error: "Keterangan maksimal 300 karakter." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tartil_materials")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("tartil_materials").insert({
    tenant_id: profile.tenantId,
    name,
    jilid: jilid || null,
    pages_label: pagesLabel || null,
    description: description || null,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return { error: friendlyDbError(error, "Gagal menambah materi.") };

  invalidateTartilConfig(profile.tenantCode);
  return { success: `Materi \"${name}\" ditambahkan.` };
}

export async function updateMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const jilid = String(formData.get("jilid") ?? "").trim();
  const pagesLabel = String(formData.get("pagesLabel") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!UUID_RE.test(id)) return { error: "Materi tidak valid." };
  if (name.length < 1 || name.length > 80) return { error: "Nama materi harus 1-80 karakter." };
  if (jilid.length > 40 || pagesLabel.length > 60 || description.length > 300) {
    return { error: "Panjang field tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_materials")
    .update({
      name,
      jilid: jilid || null,
      pages_label: pagesLabel || null,
      description: description || null,
    })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: friendlyDbError(error, "Gagal mengubah materi.") };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Materi diperbarui." };
}

export async function setMaterialActiveAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!UUID_RE.test(id)) return { error: "Materi tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_materials")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status materi." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: isActive ? "Materi diaktifkan." : "Materi dinonaktifkan." };
}

export async function deleteMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { error: "Materi tidak valid." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("tartil_assessments")
    .select("id", { count: "exact", head: true })
    .eq("material_id", id)
    .eq("tenant_id", profile.tenantId);

  if ((count ?? 0) > 0) {
    return {
      error:
        "Materi ini sudah memiliki data penilaian. Tidak dapat dihapus — gunakan Nonaktifkan agar histori tetap utuh.",
    };
  }

  const { error } = await supabase
    .from("tartil_materials")
    .delete()
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal menghapus materi." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Materi dihapus." };
}

export async function reorderMaterialsAction(orderIds: string[]): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 100) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("tartil_materials")
    .select("id")
    .eq("tenant_id", profile.tenantId);
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase.from("tartil_materials").upsert(updates, { onConflict: "id" });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Urutan materi tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* TEMPLATE CATATAN (rule #13-#15)                                          */
/* ------------------------------------------------------------------------ */

export async function createTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const slot = String(formData.get("slot") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!(NOTE_SLOTS as readonly string[]).includes(slot)) return { error: "Bagian template tidak valid." };
  if (content.length < 1 || content.length > 300) return { error: "Isi template harus 1-300 karakter." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tartil_note_templates")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("tartil_note_templates").insert({
    tenant_id: profile.tenantId,
    slot: slot as NoteSlot,
    content,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return { error: "Gagal menambah template." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Template ditambahkan." };
}

export async function updateTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!UUID_RE.test(id)) return { error: "Template tidak valid." };
  if (content.length < 1 || content.length > 300) return { error: "Isi template harus 1-300 karakter." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_note_templates")
    .update({ content })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah template." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Template diperbarui." };
}

export async function setTemplateActiveAction(
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
    .from("tartil_note_templates")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status template." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: isActive ? "Template diaktifkan." : "Template dinonaktifkan." };
}

export async function reorderTemplatesAction(orderIds: string[]): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 50) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("tartil_note_templates")
    .select("id")
    .eq("tenant_id", profile.tenantId);
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase.from("tartil_note_templates").upsert(updates, { onConflict: "id" });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateTartilConfig(profile.tenantCode);
  return { success: "Urutan template tersimpan." };
}
