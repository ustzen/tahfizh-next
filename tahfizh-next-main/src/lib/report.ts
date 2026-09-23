import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

import type {
  ReportData,
  ReportLayout,
  ReportPage,
  ReportSettingsDto,
} from "@/lib/report-shared";

/**
 * TAHFIZH V9 — Report data access (SERVER ONLY).
 * All identity/ownership checks live in the SECURITY DEFINER RPCs; the client
 * never supplies tenant/template/report ids that are trusted (rule #47).
 */

/* ------------------------------ templates --------------------------------- */

export type ReportTemplateRow = {
  id: string;
  scope: "TENANT" | "GLOBAL";
  name: string;
  description: string | null;
  paper: string;
  orientation: string;
  version: number;
  isActive: boolean;
  layout: ReportLayout | null;
  reportCount: number;
};

export async function getReportAdminTemplates(): Promise<ReportTemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_admin_templates");
  if (error) {
    console.error("report_admin_templates failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    scope: r.scope as "TENANT" | "GLOBAL",
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paper: r.paper as string,
    orientation: r.orientation as string,
    version: Number(r.version ?? 1),
    isActive: r.is_active as boolean,
    layout: (r.layout && Object.keys(r.layout as object).length > 0
      ? (r.layout as ReportLayout)
      : null),
    reportCount: Number(r.report_count ?? 0),
  }));
}

export type DevTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  paper: string;
  orientation: string;
  version: number;
  isActive: boolean;
  layout: ReportLayout | null;
  copyCount: number;
};

export async function getDevTemplates(): Promise<DevTemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_dev_templates");
  if (error) {
    console.error("report_dev_templates failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paper: r.paper as string,
    orientation: r.orientation as string,
    version: Number(r.version ?? 1),
    isActive: r.is_active as boolean,
    layout: (r.layout as ReportLayout) ?? null,
    copyCount: Number(r.copy_count ?? 0),
  }));
}

export async function getTemplateDetail(
  templateId: string
): Promise<{ id: string; name: string; paper: string; orientation: string; layout: ReportLayout | null; tenantId: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_template_detail", { p_template_id: templateId });
  if (error || !data || data.length === 0) return null;
  const r = (data as Record<string, unknown>[])[0];
  return {
    id: r.id as string,
    name: r.name as string,
    paper: r.paper as string,
    orientation: r.orientation as string,
    layout: (r.layout as ReportLayout) ?? null,
    tenantId: (r.tenant_id as string | null) ?? null,
  };
}

/* ------------------------------ settings ---------------------------------- */

export async function getReportSettings(): Promise<ReportSettingsDto> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_settings_get");
  if (error) {
    console.error("report_settings_get failed:", error.message);
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    logoPath: (r.logo_path as string | null) ?? null,
    address: (r.address as string) ?? "",
    contact: (r.contact as string) ?? "",
    footerText: (r.footer_text as string) ?? "",
    showPageNumbers: (r.show_page_numbers as boolean) ?? true,
    watermarkEnabled: (r.watermark_enabled as boolean) ?? false,
    watermarkOpacity: Number(r.watermark_opacity ?? 15),
    watermarkScale: Number(r.watermark_scale ?? 60),
    watermarkPath: (r.watermark_path as string | null) ?? null,
  };
}

/** Signed URL for a report-asset path (logo/watermark) or null. */
export async function getReportAssetUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("report-assets").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/* ------------------------------- reports ---------------------------------- */

export type ReportListItem = {
  id: string;
  title: string;
  studentName: string;
  studentCode: string;
  templateName: string;
  academicYear: string;
  semesterLabel: string;
  periodLabel: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  finalizedAt: string | null;
  updatedAt: string;
};

export async function getAdminReportList(status = "ALL"): Promise<ReportListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_admin_list", { p_status: status });
  if (error) {
    console.error("report_admin_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    templateName: r.template_name as string,
    academicYear: r.academic_year as string,
    semesterLabel: r.semester_label as string,
    periodLabel: (r.period_label as string | null) ?? null,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    status: r.status as string,
    finalizedAt: (r.finalized_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

export async function getTeacherReportList(): Promise<
  { id: string; title: string; studentName: string; studentCode: string; academicYear: string; semesterLabel: string; status: string; finalizedAt: string | null }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_teacher_list");
  if (error) {
    console.error("report_teacher_list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    studentName: r.student_name as string,
    studentCode: r.student_code as string,
    academicYear: r.academic_year as string,
    semesterLabel: r.semester_label as string,
    status: r.status as string,
    finalizedAt: (r.finalized_at as string | null) ?? null,
  }));
}

export type ReportDetail = {
  id: string;
  title: string;
  academicYear: string;
  semesterLabel: string;
  periodLabel: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  templateName: string;
  paper: string;
  orientation: string;
  layout: ReportLayout | null;
  data: ReportData | null;
  isSnapshot: boolean;
};

export async function getReportDetail(
  reportId: string
): Promise<ReportDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("reports")
    .select(
      `id, title, academic_year, semester_label, period_label, period_start, period_end,
       status, student_id, template_id,
       student:students (full_name, business_code),
       template:report_templates (name, layout, paper, orientation)`
    )
    .eq("id", reportId)
    .maybeSingle();
  if (error || !r) return null;

  // FINAL reads the immutable snapshot (rule #31/#67); DRAFT reads live data.
  let layout: ReportLayout | null = null;
  let data: ReportData | null = null;
  let isSnapshot = false;
  if (r.status === "FINAL") {
    const { data: snap } = await supabase
      .from("report_snapshots")
      .select("layout, data")
      .eq("report_id", reportId)
      .maybeSingle();
    if (snap) {
      layout = snap.layout as ReportLayout;
      data = snap.data as ReportData;
      isSnapshot = true;
    }
  }
  if (!layout || !data) {
    const templateRow = Array.isArray(r.template) ? r.template[0] : (r.template as { layout: ReportLayout } | null);
    layout = templateRow?.layout ?? null;
    const row = r as unknown as { student_id: string; period_start: string; period_end: string };
    const { data: live, error: liveErr } = await supabase.rpc("report_student_data", {
      p_student_id: row.student_id,
      p_period_start: row.period_start,
      p_period_end: row.period_end,
    });
    if (!liveErr && live) data = live as ReportData;
  }

  const studentRow = Array.isArray(r.student) ? r.student[0] : (r.student as { full_name: string; business_code: string } | null);
  const templateRow2 = Array.isArray(r.template) ? r.template[0] : (r.template as { name: string; paper: string; orientation: string } | null);
  return {
    id: r.id,
    title: r.title,
    academicYear: r.academic_year,
    semesterLabel: r.semester_label,
    periodLabel: (r.period_label as string | null) ?? null,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status,
    studentId: r.student_id as string,
    studentName: studentRow?.full_name ?? "",
    studentCode: studentRow?.business_code ?? "",
    templateName: templateRow2?.name ?? "",
    paper: templateRow2?.paper ?? "A4",
    orientation: templateRow2?.orientation ?? "PORTRAIT",
    layout,
    data,
    isSnapshot,
  };
}

/** Live data for the builder's preview (no report row needed). */
export async function getReportLiveData(
  studentId: string,
  periodStart: string,
  periodEnd: string
): Promise<ReportData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_student_data", {
    p_student_id: studentId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) {
    console.error("report_student_data failed:", error.message);
    return null;
  }
  return (data as ReportData) ?? null;
}

/** Students eligible for reports (ADMIN: whole tenant). */
export const getReportStudents = cache(async () => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, full_name, business_code, gender, status")
    .eq("tenant_id", profile.tenantId)
    .eq("status", "ACTIVE")
    .order("full_name");
  return (data ?? []).map((s) => ({
    id: s.id,
    fullName: s.full_name,
    businessCode: s.business_code,
    gender: s.gender as "L" | "P",
  }));
});

/* ------------------------------ V13 galeri -------------------------------- */

/**
 * TAHFIZH V13 — template + LAYOUT-nya, supaya halaman Raport bisa langsung
 * merender contoh raportnya (bukan sekadar daftar nama template).
 */
export type GalleryTemplate = {
  id: string;
  scope: "TENANT" | "GLOBAL";
  name: string;
  description: string | null;
  paper: string;
  orientation: string;
  version: number;
  isActive: boolean;
  isPrimary: boolean;
  layout: ReportLayout | null;
  usageCount: number;
};

function toLayout(value: unknown): ReportLayout | null {
  if (!value || typeof value !== "object") return null;
  const pages = (value as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return null;
  return value as ReportLayout;
}

/** Galeri untuk ADMIN / KOORDINATOR / USTADZ: salinan lembaga + katalog bawaan. */
export async function getReportTemplateGallery(): Promise<GalleryTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_template_gallery");
  if (error) {
    console.error("report_template_gallery failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    scope: r.scope as "TENANT" | "GLOBAL",
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paper: (r.paper as string) ?? "A4",
    orientation: (r.orientation as string) ?? "PORTRAIT",
    version: Number(r.version ?? 1),
    isActive: Boolean(r.is_active),
    isPrimary: Boolean(r.is_primary),
    layout: toLayout(r.layout),
    usageCount: Number(r.report_count ?? 0),
  }));
}

/** Galeri template global untuk DEVELOPER. */
export async function getDevTemplateGallery(): Promise<GalleryTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_dev_gallery");
  if (error) {
    console.error("report_dev_gallery failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    scope: "GLOBAL" as const,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paper: (r.paper as string) ?? "A4",
    orientation: (r.orientation as string) ?? "PORTRAIT",
    version: Number(r.version ?? 1),
    isActive: Boolean(r.is_active),
    isPrimary: Boolean(r.is_primary),
    layout: toLayout(r.layout),
    usageCount: Number(r.copy_count ?? 0),
  }));
}

/** Satu template galeri (untuk halaman "Lihat Contoh"). */
export async function getGalleryTemplate(templateId: string): Promise<GalleryTemplate | null> {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const rows =
    profile.role === "DEVELOPER" ? await getDevTemplateGallery() : await getReportTemplateGallery();
  return rows.find((t) => t.id === templateId) ?? null;
}
