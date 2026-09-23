"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { v11ErrorMessage, type OnboardingRow } from "@/lib/akademik";
import { revalidateSection } from "@/lib/cache";

export type V11Result = { error?: string; success?: string; data?: Record<string, unknown> };

/** Normalize any PG/RPC failure into a friendly Indonesian message (#69). */
function fail(e: { message: string } | null): { error: string } {
  return { error: v11ErrorMessage(e?.message ?? "") };
}

function requireAdmin(profile: Awaited<ReturnType<typeof getSessionProfile>>) {
  return Boolean(profile && profile.role === "ADMIN" && profile.tenantId);
}

function requireStaff(profile: Awaited<ReturnType<typeof getSessionProfile>>) {
  return Boolean(profile && (profile.role === "ADMIN" || profile.role === "KOORDINATOR") && profile.tenantId);
}

/* ------------------------------------------------------------------------ */
/* Tahun ajaran & semester (#4-#12, #61)                                    */
/* ------------------------------------------------------------------------ */

export async function saveAcademicYearAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const activate = formData.get("activate") === "on";
  const s1Start = String(formData.get("s1Start") ?? "");
  const s1End = String(formData.get("s1End") ?? "");
  const s2Start = String(formData.get("s2Start") ?? "");
  const s2End = String(formData.get("s2End") ?? "");

  if (!/^\d{4}\/\d{4}$/.test(name)) return { error: "Format nama harus 2026/2027." };
  if (!startDate || !endDate) return { error: "Tanggal mulai dan selesai wajib diisi." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("academic_year_save", {
    p_id: id,
    p_name: name,
    p_start: startDate,
    p_end: endDate,
    p_activate: activate,
    p_s1_start: s1Start || null,
    p_s1_end: s1End || null,
    p_s2_start: s2Start || null,
    p_s2_end: s2End || null,
  });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: id ? "Tahun ajaran diperbarui." : `Tahun ajaran ${name} dibuat.`, data: { id } };
}

export async function activateAcademicYearAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const yearId = String(formData.get("yearId") ?? "");
  if (!yearId) return { error: "Tahun ajaran tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("academic_year_activate", { p_year_id: yearId });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Tahun ajaran diaktifkan. Tahun lain otomatis menjadi arsip." };
}

export async function archiveAcademicYearAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const yearId = String(formData.get("yearId") ?? "");
  if (!yearId) return { error: "Tahun ajaran tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("academic_year_archive", { p_year_id: yearId });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Tahun ajaran diarsipkan." };
}

export async function activateSemesterAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const semesterId = String(formData.get("semesterId") ?? "");
  if (!semesterId) return { error: "Semester tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("academic_semester_set_active", { p_semester_id: semesterId });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Semester aktif diperbarui." };
}

export async function setSemesterStatusAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const semesterId = String(formData.get("semesterId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!semesterId || !["AKTIF", "SELESAI", "BELUM"].includes(status))
    return { error: "Permintaan tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("academic_semester_set_status", {
    p_semester_id: semesterId,
    p_status: status,
  });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Status semester diperbarui." };
}

/* ------------------------------------------------------------------------ */
/* Hari & jadwal pembelajaran (#13-#16)                                     */
/* ------------------------------------------------------------------------ */

export async function saveLearningDaysAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const days = formData.getAll("days").map(String).filter((d) =>
    ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"].includes(d)
  );
  if (days.length === 0) return { error: "Pilih minimal satu hari pembelajaran." };
  const note = String(formData.get("note") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("learning_settings")
    .upsert({ tenant_id: profile!.tenantId!, days, note: note || null }, { onConflict: "tenant_id" });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Hari pembelajaran tersimpan." };
}

export async function saveScheduleAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "") || null;
  const halaqahId = String(formData.get("halaqahId") ?? "");
  const day = String(formData.get("day") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const room = String(formData.get("room") ?? "").trim();

  if (!halaqahId) return { error: "Pilih halaqah terlebih dahulu." };
  if (!day) return { error: "Pilih hari." };
  if (!start || !end) return { error: "Jam mulai dan selesai wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_schedule_save", {
    p_id: id,
    p_halaqah_id: halaqahId,
    p_day: day,
    p_start: start,
    p_end: end,
    p_room: room || null,
  });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Jadwal tersimpan." };
}

export async function deleteScheduleAction(
  _prev: V11Result | null,
  formData: FormData
): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Jadwal tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_schedule_delete", { p_id: id });
  if (error) return fail(error);

  invalidateAkademik();
  return { success: "Jadwal dihapus." };
}

/* ------------------------------------------------------------------------ */
/* Onboarding (#17-#28)                                                     */
/* ------------------------------------------------------------------------ */

export async function getOnboardingAction(): Promise<{ data?: OnboardingRow; error?: string }> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onboarding_get");
  if (error) return { error: fail(error).error };
  return {
    data: {
      currentStep: Number(data?.currentStep ?? 0),
      completed: Boolean(data?.completed),
      dismissed: Boolean(data?.dismissed),
    },
  };
}

export async function completeOnboardingStepAction(step: number): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };
  if (!Number.isInteger(step) || step < 1 || step > 10) return { error: "Langkah tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_complete", { p_step: step });
  if (error) return fail(error);

  revalidatePath("/admin");
  revalidatePath("/admin/onboarding");
  return { success: "Progres onboarding tersimpan." };
}

export async function skipOnboardingAction(): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_skip");
  if (error) return fail(error);

  revalidatePath("/admin");
  revalidatePath("/admin/onboarding");
  return { success: "Onboarding dilewati. Anda dapat melanjutkannya kapan saja." };
}

export async function finishOnboardingAction(): Promise<V11Result> {
  const profile = await getSessionProfile();
  if (!requireAdmin(profile)) return { error: "Akses ditolak." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_complete", { p_step: 10 });
  if (error) return fail(error);

  revalidatePath("/admin");
  revalidatePath("/admin/onboarding");
  return { success: "TAHFIZH siap digunakan." };
}

/* ------------------------------------------------------------------------ */
/* Cache invalidation (rule #56)                                            */
/* ------------------------------------------------------------------------ */

function invalidateAkademik() {
  revalidateSection(
    "/admin",
    "/admin/akademik",
    "/admin/akademik/jadwal",
    "/admin/akademik/mutasi",
    "/admin/akademik/arsip",
    "/admin/onboarding",
    "/koordinator/halaqah",
    "/ustadz/halaqah",
    "/ustadz",
    "/santri"
  );
}
