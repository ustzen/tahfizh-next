"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateReportSettings, invalidateReportTemplates, invalidateReports } from "@/lib/cache";
import type { ReportLayout } from "@/lib/report-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V9 — Report server actions (rule #45-#47, #55, #69, #88).
 * Every write goes through SECURITY DEFINER RPCs that verify session → role →
 * tenant → ownership. The client never passes a trusted tenant id.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V13 — pengelola template lembaga: ADMIN, KOORDINATOR, dan USTADZ (guru).
 * DEVELOPER mengelola template global. RPC tetap memverifikasi ulang role +
 * tenant, jadi pemeriksaan di sini hanya lapis pertama (rule #47).
 */
const TEMPLATE_MANAGER_ROLES = ["DEVELOPER", "ADMIN", "KOORDINATOR", "USTADZ"];

function canManageTemplates(role: string | undefined): boolean {
  return !!role && TEMPLATE_MANAGER_ROLES.includes(role);
}

const REPORT_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK/, message: "Anda tidak memiliki akses." },
  { match: /TEMPLATE_TIDAK_DITEMUKAN|RAPORT_TIDAK_DITEMUKAN/, message: "Template atau raport tidak dapat dimuat." },
  { match: /NAMA_TIDAK_VALID|JUDUL_TIDAK_VALID/, message: "Nama/judul wajib diisi (1-160 karakter)." },
  { match: /LAYOUT_TIDAK_VALID/, message: "Layout raport tidak valid. Periksa posisi & ukuran komponen." },
  { match: /PERIODE_TIDAK_VALID/, message: "Periode tidak valid — akhir tidak boleh sebelum mulai." },
  { match: /SANTRI_TIDAK_DITEMUKAN/, message: "Santri tidak ditemukan di lembaga Anda." },
  { match: /TEMPLATE_DIGUNAKAN/, message: "Template sudah dipakai raport atau memiliki salinan. Nonaktifkan saja." },
  { match: /RAPORT_SUDAH_FINAL/, message: "Raport sudah final. Gunakan Buka Kembali untuk merevisi." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of REPORT_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Raport belum berhasil disimpan. Silakan coba lagi."; // rule #88
}

/* --------------------------- TEMPLATE CRUD -------------------------------- */

export async function saveReportTemplateAction(input: {
  templateId?: string | null;
  name: string;
  description: string;
  paper: string;
  orientation: string;
  layout: ReportLayout;
}): Promise<ActionResult & { id?: string }> {
  const profile = await getSessionProfile();
  if (!profile || !canManageTemplates(profile.role)) {
    return { error: "Anda tidak memiliki akses." };
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) return { error: "Nama template wajib diisi (1-120 karakter)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_template_save", {
    p_template_id: input.templateId ?? null,
    p_name: name,
    p_description: input.description.trim().slice(0, 300) || null,
    p_paper: input.paper,
    p_orientation: input.orientation,
    p_layout: input.layout,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportTemplates();
  return {
    success: input.templateId ? "Template diperbarui (versi baru tersimpan)." : "Template dibuat.",
    id: (data as string) ?? undefined,
  };
}

export async function duplicateReportTemplateAction(input: {
  templateId: string;
  newName?: string;
}): Promise<ActionResult & { id?: string }> {
  const profile = await getSessionProfile();
  if (!profile || !canManageTemplates(profile.role)) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_template_duplicate", {
    p_template_id: input.templateId,
    p_new_name: input.newName?.trim() || null,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportTemplates();
  return { success: "Template digandakan.", id: (data as string) ?? undefined };
}

export async function setReportTemplateActiveAction(input: {
  templateId: string;
  active: boolean;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !canManageTemplates(profile.role)) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_template_set_active", {
    p_template_id: input.templateId,
    p_active: input.active,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportTemplates();
  return { success: input.active ? "Template diaktifkan." : "Template dinonaktifkan." };
}

export async function setReportTemplatePrimaryAction(input: {
  templateId: string;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !canManageTemplates(profile.role)) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_template_set_primary", {
    p_template_id: input.templateId,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportTemplates();
  return {
    success:
      profile.role === "DEVELOPER"
        ? "Template ditandai sebagai contoh utama bawaan."
        : "Template dijadikan raport utama lembaga.",
  };
}

export async function deleteReportTemplateAction(input: { templateId: string }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  // Hapus tetap kewenangan ADMIN (global: DEVELOPER) — guru/koordinator cukup
  // menonaktifkan agar riwayat raport lembaga tidak pernah hilang.
  if (!profile || (profile.role !== "DEVELOPER" && profile.role !== "ADMIN")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_template_delete", { p_template_id: input.templateId });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportTemplates();
  return { success: "Template dihapus." };
}

/* --------------------------- REPORT SETTINGS ------------------------------ */

export async function saveReportSettingsAction(input: {
  address: string;
  contact: string;
  footerText: string;
  showPageNumbers: boolean;
  watermarkEnabled: boolean;
  watermarkOpacity: number;
  watermarkScale: number;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Anda tidak memiliki akses." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_settings_save", {
    p_address: input.address.trim().slice(0, 300) || null,
    p_contact: input.contact.trim().slice(0, 200) || null,
    p_footer_text: input.footerText.trim().slice(0, 200) || null,
    p_show_page_numbers: input.showPageNumbers,
    p_watermark_enabled: input.watermarkEnabled,
    p_watermark_opacity: Math.round(Math.min(50, Math.max(5, input.watermarkOpacity))),
    p_watermark_scale: Math.round(Math.min(100, Math.max(10, input.watermarkScale))),
    p_logo_path: null, // logo changes go through uploadReportAssetAction
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReportSettings(profile.tenantCode);
  return { success: "Pengaturan raport tersimpan." };
}

export async function uploadReportAssetAction(input: {
  kind: "LOGO" | "WATERMARK";
  file: File;
}): Promise<ActionResult & { path?: string }> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Anda tidak memiliki akses." };
  }
  const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!ALLOWED.includes(input.file.type)) return { error: "Format harus PNG, JPG, WebP, atau SVG." };
  if (input.file.size > 2 * 1024 * 1024) return { error: "Ukuran gambar maksimal 2 MB." };

  const supabase = await createClient();
  const ext =
    input.file.type === "image/svg+xml"
      ? "svg"
      : input.file.type === "image/png"
        ? "png"
        : input.file.type === "image/webp"
          ? "webp"
          : "jpg";
  // Tenant-namespaced path — Tenant A can never read Tenant B's assets (rule #45/#69).
  const path = `${profile.tenantId}/${input.kind === "LOGO" ? "logo" : "watermark"}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("report-assets")
    .upload(path, input.file, { upsert: true, contentType: input.file.type });
  if (upErr) return { error: "Gagal mengunggah gambar. Periksa bucket report-assets." };

  const { error: saveErr } = await supabase.rpc("report_settings_save", {
    p_logo_path: input.kind === "LOGO" ? path : null,
  });
  if (saveErr) return { error: friendlyError(saveErr.message) };

  invalidateReportSettings(profile.tenantCode);
  return { success: "Gambar diperbarui.", path };
}

export async function clearReportAssetAction(input: { kind: "LOGO" | "WATERMARK" }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Anda tidak memiliki akses." };
  }
  const supabase = await createClient();
  const { data: settings } = await supabase.rpc("report_settings_get");
  const path = (settings as Record<string, unknown> | null)?.[
    input.kind === "LOGO" ? "logo_path" : "watermark_path"
  ] as string | null;

  if (path) {
    await supabase.storage.from("report-assets").remove([path]);
  }
  if (input.kind === "LOGO") {
    const { error } = await supabase.rpc("report_settings_save", { p_logo_path: "" });
    if (error) return { error: friendlyError(error.message) };
  } else {
    const { error } = await supabase.rpc("report_settings_save", { p_watermark_enabled: false });
    if (error) return { error: friendlyError(error.message) };
  }

  invalidateReportSettings(profile.tenantCode);
  return { success: "Gambar dihapus." };
}

/* --------------------------- REPORT LIFECYCLE ----------------------------- */

export async function createReportAction(input: {
  templateId: string;
  studentId: string;
  title: string;
  academicYear: string;
  semester: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ActionResult & { id?: string }> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Anda tidak memiliki akses." };

  if (!UUID_RE.test(input.templateId) || !UUID_RE.test(input.studentId)) {
    return { error: "Pilih template dan santri terlebih dahulu." };
  }
  const title = input.title.trim();
  const ay = input.academicYear.trim();
  if (title.length < 1 || title.length > 160) return { error: "Judul wajib diisi (1-160 karakter)." };
  if (ay.length < 4 || ay.length > 20) return { error: "Tahun ajaran wajib diisi (contoh: 2026/2027)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) {
    return { error: "Periode tidak valid." };
  }
  if (input.periodEnd < input.periodStart) return { error: "Periode tidak valid — akhir tidak boleh sebelum mulai." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_create", {
    p_template_id: input.templateId,
    p_student_id: input.studentId,
    p_title: title,
    p_academic_year: ay,
    p_semester: input.semester.trim().slice(0, 40) || "Semester 1",
    p_period_label: input.periodLabel.trim().slice(0, 80) || null,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateReports([input.studentId]);
  return { success: "Raport dibuat sebagai draft.", id: (data as string) ?? undefined };
}

export async function finalizeReportAction(input: { reportId: string }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Anda tidak memiliki akses." };
  if (!UUID_RE.test(input.reportId)) return { error: "Raport tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_finalize", { p_report_id: input.reportId });
  if (error) return { error: friendlyError(error.message) };

  invalidateReports();
  return { success: "Raport difinalkan — data dibekukan sebagai snapshot." };
}

export async function reopenReportAction(input: { reportId: string }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Anda tidak memiliki akses." };
  if (!UUID_RE.test(input.reportId)) return { error: "Raport tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_reopen", { p_report_id: input.reportId });
  if (error) return { error: friendlyError(error.message) };

  invalidateReports();
  return { success: "Raport dibuka kembali sebagai draft untuk revisi." };
}

export async function deleteReportAction(input: { reportId: string }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Anda tidak memiliki akses." };
  if (!UUID_RE.test(input.reportId)) return { error: "Raport tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_delete", { p_report_id: input.reportId });
  if (error) return { error: friendlyError(error.message) };

  invalidateReports();
  return { success: "Draft raport dihapus." };
}
