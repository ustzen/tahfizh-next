"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateReportTemplates } from "@/lib/cache";
import type { ReportLayout } from "@/lib/report-shared";
import type { ActionResult } from "@/app/actions/crud";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function validateLayout(layout: ReportLayout): string | null {
  if (!layout || !Array.isArray(layout.pages) || layout.pages.length === 0) {
    return "Layout raport tidak valid.";
  }
  if (layout.pages.length > 10) return "Maksimal 10 halaman.";
  for (const page of layout.pages) {
    if (!Array.isArray(page.components)) return "Layout raport tidak valid.";
    if (page.components.length > 80) return "Terlalu banyak komponen pada satu halaman.";
    for (const c of page.components) {
      if (
        typeof c.x !== "number" || typeof c.y !== "number" ||
        typeof c.w !== "number" || typeof c.h !== "number" ||
        c.w <= 0 || c.h <= 0 || c.x < 0 || c.y < 0
      ) {
        return "Posisi/ukuran komponen tidak valid.";
      }
    }
  }
  return null;
}

/**
 * TAHFIZH V9 — persist a template layout from the builder (rule #54/#55:
 * explicit Save, never per-drag). RPC re-verifies role + ownership.
 */
export async function saveReportTemplateLayoutAction(input: {
  templateId: string;
  layout: ReportLayout;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  // V13 — guru & koordinator lembaga juga boleh menyunting layout template
  // milik lembaganya; RPC memverifikasi ulang role + tenant.
  const allowed = ["DEVELOPER", "ADMIN", "KOORDINATOR", "USTADZ"];
  if (!profile || !allowed.includes(profile.role)) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };
  const invalid = validateLayout(input.layout);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_template_save_layout", {
    p_template_id: input.templateId,
    p_layout: input.layout,
  });
  if (error) {
    const message = error.message;
    if (message.includes("AKSES_DITOLAK")) return { error: "Anda tidak memiliki akses." };
    if (message.includes("TEMPLATE_TIDAK_DITEMUKAN")) return { error: "Template tidak dapat dimuat." };
    return { error: "Raport belum berhasil disimpan. Silakan coba lagi." };
  }

  invalidateReportTemplates();
  return { success: "Layout tersimpan." };
}
