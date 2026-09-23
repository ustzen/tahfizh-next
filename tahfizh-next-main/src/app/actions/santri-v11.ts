"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { v11ErrorMessage } from "@/lib/akademik";

export type V11Result = { error?: string; success?: string; data?: Record<string, unknown> };

function fail(e: { message: string } | null): { error: string } {
  return { error: v11ErrorMessage(e?.message ?? "") };
}

/* ------------------------------------------------------------------------ */
/* Mutasi antar halaqah (#29-#31)                                           */
/* ------------------------------------------------------------------------ */

export async function transferStudentAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId || !["ADMIN", "KOORDINATOR"].includes(profile.role))
    return { error: "Akses ditolak." };

  const studentId = String(formData.get("studentId") ?? "");
  const toHalaqahId = String(formData.get("toHalaqahId") ?? "");
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const semesterId = String(formData.get("semesterId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!studentId || !toHalaqahId) return { error: "Pilih santri dan halaqah tujuan." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  const { error } = await supabase.rpc("student_transfer", {
    p_student_id: studentId,
    p_to_halaqah_id: toHalaqahId,
    p_effective_date: effectiveDate || null,
    p_semester_id: semesterId || null,
    p_reason: reason || null,
  });
  if (error) return fail(error);

  invalidateSantri();
  const name = student?.full_name ?? "Santri";
  const { data: halaqah } = await supabase
    .from("halaqahs")
    .select("name")
    .eq("id", toHalaqahId)
    .maybeSingle();
  await notify(profile.tenantId, `Mutasi ${name}`, `${name} dipindahkan ke ${halaqah?.name ?? "halaqah baru"}.`);
  return { success: `${name} berhasil dipindahkan ke ${halaqah?.name ?? "halaqah tujuan"}.` };
}

/* ------------------------------------------------------------------------ */
/* Bulk promotion (#32/#33)                                                 */
/* ------------------------------------------------------------------------ */

export async function promoteStudentsAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId || !["ADMIN", "KOORDINATOR"].includes(profile.role))
    return { error: "Akses ditolak." };

  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);
  const toLevel = String(formData.get("toLevel") ?? "").trim();
  const semesterId = String(formData.get("semesterId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (studentIds.length === 0) return { error: "Pilih minimal satu santri." };
  if (!toLevel) return { error: "Isi level tujuan." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_promote", {
    p_student_ids: JSON.stringify(studentIds),
    p_to_level: toLevel,
    p_semester_id: semesterId || null,
    p_note: note || null,
  });
  if (error) return fail(error);

  invalidateSantri();
  const result = data as { promoted?: number; failed?: { id: string; reason: string }[] } | null;
  const promoted = Number(result?.promoted ?? 0);
  const failed = result?.failed ?? [];

  if (failed.length > 0) {
    const names = await supabase
      .from("students")
      .select("id, full_name")
      .in("id", failed.map((f) => f.id));
    const nameMap = new Map((names.data ?? []).map((n) => [n.id, n.full_name]));
    const detail = failed
      .map((f) => `${nameMap.get(f.id) ?? f.id}: ${f.reason}`)
      .join("; ");
    return {
      success: `${promoted} santri berhasil dinaikkan level.`,
      error: `Sebagian gagal — ${detail}`,
    };
  }
  return { success: `${promoted} santri berhasil dinaikkan ke level ${toLevel}.` };
}

/* ------------------------------------------------------------------------ */
/* Status lifecycle (#35-#42)                                               */
/* ------------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  LULUS: "Lulus",
  PINDAH: "Pindah",
  KELUAR: "Keluar",
  NONAKTIF: "Nonaktif",
};

export async function setStudentStatusAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!profile || !profile.tenantId || !["ADMIN", "KOORDINATOR"].includes(profile.role))
    return { error: "Akses ditolak." };

  const studentId = String(formData.get("studentId") ?? "");
  const status = String(formData.get("status") ?? "");
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const semesterId = String(formData.get("semesterId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const targetName = String(formData.get("targetName") ?? "").trim();

  if (!studentId || !STATUS_LABELS[status]) return { error: "Permintaan tidak valid." };
  if (status === "PINDAH" && !targetName)
    return { error: "Isi lembaga tujuan untuk status Pindah." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  const { error } = await supabase.rpc("student_set_status", {
    p_student_id: studentId,
    p_status: status,
    p_effective_date: effectiveDate || null,
    p_semester_id: semesterId || null,
    p_reason: reason || null,
    p_note: note || null,
    p_target_name: targetName || null,
  });
  if (error) return fail(error);

  invalidateSantri();
  const name = student?.full_name ?? "Santri";
  await notify(profile.tenantId, `Status ${name} diperbarui`, `${name} → ${STATUS_LABELS[status]}.`);
  return { success: `Status ${name} diubah menjadi ${STATUS_LABELS[status]}.` };
}

/* ------------------------------------------------------------------------ */
/* Cache invalidation (rule #56)                                            */
/* ------------------------------------------------------------------------ */

function invalidateSantri() {
  for (const path of [
    "/admin",
    "/admin/akademik/mutasi",
    "/admin/akademik/arsip",
    "/koordinator/santri",
    "/koordinator/guru",
    "/admin/santri",
    "/admin/guru",
    "/koordinator/halaqah",
    "/ustadz/santri",
    "/ustadz",
    "/santri",
  ]) {
    revalidatePath(path);
  }
}

/** In-app notification via V10 notifications table (rule #67). */
async function notify(tenantId: string, title: string, body: string) {
  try {
    const supabase = await createClient();
    // All ADMIN + KOORDINATOR profiles of this tenant.
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("role", ["ADMIN", "KOORDINATOR"]);
    if (!data || data.length === 0) return;
    await supabase.from("notifications").insert(
      data.map((p) => ({
        user_id: p.id,
        tenant_id: tenantId,
        type: "INFO",
        title,
        body,
      }))
    );
  } catch {
    // Notifications must never break the main operation.
  }
}
