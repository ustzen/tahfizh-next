"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateSetoranConfig, invalidateLearningAssessments } from "@/lib/cache";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V12.12 — Kelola template catatan LANGSUNG dari form Setoran.
 *
 * Guru (dan admin/koordinator) bisa MENAMBAH template baru (pilih label:
 * Apresiasi / Kelancaran / Kesalahan / dll.) atau MENGUBAH isi template yang
 * ada — tanpa harus ke Pengaturan. Semua tulisan tetap tenant-scoped dan
 * divalidasi server-side; RLS tabel template menjamin isolasi lembaga.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Isi template tanpa titik di akhir — klik beberapa template tak menghasilkan tanda baca ganda. */
function stripTrailingDot(s: string): string {
  return (s ?? "").trim().replace(/[.\s]+$/u, "").trim();
}

/** Slot valid per modul (harus cocok dengan vocab RPC penilaian). */
const SLOTS_BY_MODULE: Record<string, string[]> = {
  TAHFIDZ: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
  HADITS: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
  DOA: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
};

async function requireWriter() {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "ADMIN", "KOORDINATOR"].includes(profile.role) || !profile.tenantId) {
    return null;
  }
  return profile;
}

/** Tambah template baru pada label (slot) yang dipilih. */
export async function createInlineTemplateAction(input: {
  module: "TAHFIDZ" | "HADITS" | "DOA";
  slot: string;
  content: string;
}): Promise<ActionResult> {
  const profile = await requireWriter();
  if (!profile) return { error: "Akses ditolak. Silakan login kembali." };

  const slots = SLOTS_BY_MODULE[input.module];
  if (!slots || !slots.includes(input.slot)) {
    return { error: "Label template tidak valid." };
  }
  const content = stripTrailingDot(input.content);
  if (content.length < 1 || content.length > 300) {
    return { error: "Isi template harus 1-300 karakter." };
  }

  const supabase = await createClient();

  if (input.module === "TAHFIDZ") {
    const { data: last } = await supabase
      .from("tahfidz_submission_templates")
      .select("sort_order")
      .eq("tenant_id", profile.tenantId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const { error } = await supabase.from("tahfidz_submission_templates").insert({
      tenant_id: profile.tenantId,
      slot: input.slot,
      content,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    });
    if (error) return { error: "Gagal menambah template." };
    invalidateSetoranConfig(profile.tenantCode);
  } else {
    const { data: last } = await supabase
      .from("learning_note_templates")
      .select("sort_order")
      .eq("tenant_id", profile.tenantId)
      .eq("module_type", input.module)
      .order("sort_order", { ascending: false })
      .limit(1);
    const { error } = await supabase.from("learning_note_templates").insert({
      tenant_id: profile.tenantId,
      module_type: input.module,
      slot: input.slot,
      content,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    });
    if (error) return { error: "Gagal menambah template." };
    invalidateLearningAssessments([], input.module as "HADITS" | "DOA");
  }

  return { success: "Template ditambahkan." };
}

/** Ubah isi template yang ada (semua role lembaga yang menilai). */
export async function updateInlineTemplateAction(input: {
  module: "TAHFIDZ" | "HADITS" | "DOA";
  templateId: string;
  content: string;
}): Promise<ActionResult> {
  const profile = await requireWriter();
  if (!profile) return { error: "Akses ditolak. Silakan login kembali." };

  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };
  const content = stripTrailingDot(input.content);
  if (content.length < 1 || content.length > 300) {
    return { error: "Isi template harus 1-300 karakter." };
  }

  const supabase = await createClient();

  if (input.module === "TAHFIDZ") {
    const { error } = await supabase
      .from("tahfidz_submission_templates")
      .update({ content })
      .eq("id", input.templateId)
      .eq("tenant_id", profile.tenantId);
    if (error) return { error: "Gagal mengubah template." };
    invalidateSetoranConfig(profile.tenantCode);
  } else {
    const { error } = await supabase
      .from("learning_note_templates")
      .update({ content })
      .eq("id", input.templateId)
      .eq("tenant_id", profile.tenantId)
      .eq("module_type", input.module);
    if (error) return { error: "Gagal mengubah template." };
    invalidateLearningAssessments([], input.module as "HADITS" | "DOA");
  }

  return { success: "Template diperbarui." };
}

/** Hapus template (ikon × pada chip) — tenant-scoped. */
export async function deleteInlineTemplateAction(input: {
  module: "TAHFIDZ" | "HADITS" | "DOA";
  templateId: string;
}): Promise<ActionResult> {
  const profile = await requireWriter();
  if (!profile) return { error: "Akses ditolak. Silakan login kembali." };
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();

  if (input.module === "TAHFIDZ") {
    const { error } = await supabase
      .from("tahfidz_submission_templates")
      .delete()
      .eq("id", input.templateId)
      .eq("tenant_id", profile.tenantId);
    if (error) return { error: "Gagal menghapus template." };
    invalidateSetoranConfig(profile.tenantCode);
  } else {
    const { error } = await supabase
      .from("learning_note_templates")
      .delete()
      .eq("id", input.templateId)
      .eq("tenant_id", profile.tenantId)
      .eq("module_type", input.module);
    if (error) return { error: "Gagal menghapus template." };
    invalidateLearningAssessments([], input.module as "HADITS" | "DOA");
  }

  return { success: "Template dihapus." };
}
