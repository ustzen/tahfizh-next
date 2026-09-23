"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateLearningConfig } from "@/lib/cache";
import { LEARNING_MODULES, LEARNING_MODULE_CONFIGS, type LearningModule } from "@/lib/learning-shared";
import { moduleTable } from "@/lib/learning";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V6 — konfigurasi materi & template Hadits/Doa/Tajwid (rule #28-#29).
 * V12.7: selain ADMIN, KOORDINATOR lembaga kini juga dapat MENAMBAH & mengelola
 * materi Hadits dan Doa Harian (permintaan pengguna). Role dibaca ulang dari
 * session setiap panggilan; tenant-scoped only (rule #32).
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  const profile = await getSessionProfile();
  // V12.7: KOORDINATOR diizinkan mengelola materi pembelajaran (RLS V1 sudah
  // mengizinkan insert/update teachers... materi tabel tenant-scoped).
  if (!profile || !("ADMIN" === profile.role || "KOORDINATOR" === profile.role) || !profile.tenantId) return null;
  return profile;
}

function friendlyDbError(error: { code?: string }, fallback: string): string {
  if (error.code === "23503") {
    return "Materi ini sudah digunakan dalam penilaian. Gunakan Nonaktifkan, bukan hapus.";
  }
  if (error.code === "23505") return "Judul sudah ada (duplikat).";
  return fallback;
}

/* ------------------------------------------------------------------------ */
/* MATERIALS — generic across the three tables (rule #28-#29)               */
/* ------------------------------------------------------------------------ */

function parseMaterialFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    subtitle: String(formData.get("subtitle") ?? "").trim(), // source_ref / category
    arabicText: String(formData.get("arabicText") ?? "").trim(),
    translation: String(formData.get("translation") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
}

function validateMaterial(fields: ReturnType<typeof parseMaterialFields>): string | null {
  if (fields.title.length < 1 || fields.title.length > 160) {
    return "Judul wajib diisi (maksimal 160 karakter)."; // rule #44
  }
  for (const [name, max] of [
    ["subtitle", 200],
    ["translation", 1000],
    ["description", 500],
  ] as const) {
    if (fields[name].length > max) return `Field ${name} terlalu panjang.`;
  }
  if (fields.arabicText.length > 2000) return "Teks Arab maksimal 2000 karakter.";
  return null;
}

export async function createLearningMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const module = String(formData.get("module") ?? "");
  if (!(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Modul tidak valid." };
  }
  const fields = parseMaterialFields(formData);
  const err = validateMaterial(fields);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from(moduleTable(module as LearningModule))
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const values: Record<string, unknown> = {
    tenant_id: profile.tenantId,
    created_by: profile.id,
    title: fields.title,
    description: fields.description || null,
    translation: fields.translation || null,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  };
  if (module === "HADITS") {
    values.arabic_text = fields.arabicText || null;
    values.source_ref = fields.subtitle || null;
  } else if (module === "DOA") {
    values.arabic_text = fields.arabicText || null;
    values.latin_text = fields.subtitle || null; // latin/transliterasi rule #12
  } else {
    values.arabic_example = fields.arabicText || null;
    values.category = fields.subtitle || null;
  }

  const { error } = await supabase.from(moduleTable(module as LearningModule)).insert(values);
  if (error) return { error: friendlyDbError(error, "Gagal menambah materi.") };

  invalidateLearningConfig(profile.tenantCode);
  return { success: `Materi "${fields.title}" ditambahkan.` };
}

export async function updateLearningMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const module = String(formData.get("module") ?? "");
  if (!UUID_RE.test(id) || !(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Data tidak valid." };
  }
  const fields = parseMaterialFields(formData);
  const err = validateMaterial(fields);
  if (err) return { error: err };

  const values: Record<string, unknown> = {
    title: fields.title,
    description: fields.description || null,
    translation: fields.translation || null,
  };
  if (module === "HADITS") {
    values.arabic_text = fields.arabicText || null;
    values.source_ref = fields.subtitle || null;
  } else if (module === "DOA") {
    values.arabic_text = fields.arabicText || null;
    values.latin_text = fields.subtitle || null;
  } else {
    values.arabic_example = fields.arabicText || null;
    values.category = fields.subtitle || null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(moduleTable(module as LearningModule))
    .update(values)
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: friendlyDbError(error, "Gagal mengubah materi.") };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Materi diperbarui." };
}

export async function setLearningMaterialActiveAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const module = String(formData.get("module") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!UUID_RE.test(id) || !(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Data tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(moduleTable(module as LearningModule))
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status materi." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: isActive ? "Materi diaktifkan." : "Materi dinonaktifkan." };
}

export async function deleteLearningMaterialAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const module = String(formData.get("module") ?? "");
  if (!UUID_RE.test(id) || !(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Data tidak valid." };
  }

  const supabase = await createClient();
  // Rule #48: hard delete only when the material has no history.
  const { count } = await supabase
    .from("learning_assessments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenantId)
    .eq(
      module === "HADITS" ? "hadith_id" : module === "DOA" ? "prayer_id" : "tajwid_id",
      id
    );
  if ((count ?? 0) > 0) {
    return {
      error:
        "Materi ini sudah memiliki data penilaian. Tidak dapat dihapus — gunakan Nonaktifkan agar histori tetap utuh.",
    };
  }

  const { error } = await supabase
    .from(moduleTable(module as LearningModule))
    .delete()
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal menghapus materi." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Materi dihapus." };
}

export async function reorderLearningMaterialsAction(
  module: LearningModule,
  orderIds: string[]
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };
  if (!(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Modul tidak valid." };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 100) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from(moduleTable(module))
    .select("id")
    .eq("tenant_id", profile.tenantId);
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase.from(moduleTable(module)).upsert(updates, { onConflict: "id" });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Urutan materi tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* NOTE TEMPLATES (reusable engine, module-scoped; rule #20)                */
/* ------------------------------------------------------------------------ */

export async function createLearningTemplateAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };

  const module = String(formData.get("module") ?? "");
  const slot = String(formData.get("slot") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Modul tidak valid." };
  }
  if (!(LEARNING_MODULE_CONFIGS[module as LearningModule].noteSlots as readonly string[]).includes(slot)) {
    return { error: "Bagian template tidak valid untuk modul ini." };
  }
  if (content.length < 1 || content.length > 300) {
    return { error: "Isi template harus 1-300 karakter." };
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("learning_note_templates")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .eq("module_type", module)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("learning_note_templates").insert({
    tenant_id: profile.tenantId,
    module_type: module,
    slot,
    content,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return { error: friendlyDbError(error, "Gagal menambah template.") };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Template ditambahkan." };
}

export async function updateLearningTemplateAction(
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
    .from("learning_note_templates")
    .update({ content })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah template." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Template diperbarui." };
}

export async function setLearningTemplateActiveAction(
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
    .from("learning_note_templates")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status template." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: isActive ? "Template diaktifkan." : "Template dinonaktifkan." };
}

export async function reorderLearningTemplatesAction(
  module: LearningModule,
  orderIds: string[]
): Promise<ActionResult> {
  const profile = await requireAdmin();
  if (!profile) return { error: "Akses ditolak." };
  if (!(LEARNING_MODULES as readonly string[]).includes(module)) {
    return { error: "Modul tidak valid." };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 50) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("learning_note_templates")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .eq("module_type", module);
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase
    .from("learning_note_templates")
    .upsert(updates, { onConflict: "id" });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateLearningConfig(profile.tenantCode);
  return { success: "Urutan template tersimpan." };
}
