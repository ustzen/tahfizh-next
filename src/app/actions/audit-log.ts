"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * V12.13 — UI Log Aktivitas (audit) untuk Admin lembaga.
 *
 * Tabel tenant_audit_log sudah menampung perubahan pengaturan lembaga
 * (terminologi, identitas, pimpinan) dan aksi halaqah. Baru kini ada UI-nya:
 * Admin membuka Pengaturan → Log Aktivitas untuk melihat siapa mengubah apa
 * dan kapan. Pembacaan via client biasa — policy RLS hanya mengizinkan
 * ADMIN/DEVELOPER tenant, jadi tidak ada penurunan keamanan.
 */

export type AuditRow = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
};

export async function getAuditLog(limit = 100): Promise<AuditRow[]> {
  const session = await getSessionProfile();
  if (!session || !["ADMIN", "DEVELOPER"].includes(session.role) || !session.tenantId) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_audit_log")
    .select(
      `id, action, detail, created_at,
       actor:profiles!tenant_audit_log_actor_id_fkey (full_name, role)`
    )
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getAuditLog]", error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    const actor = r.actor as { full_name?: string; role?: string } | null;
    return {
      id: r.id,
      action: r.action,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      created_at: r.created_at,
      actor_name: actor?.full_name ?? null,
      actor_role: actor?.role ?? null,
    };
  });
}
