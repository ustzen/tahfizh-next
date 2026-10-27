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

/**
 * Setelah tahun ajaran diaktifkan semester-nya masih "Belum Aktif", sehingga
 * lembaga tidak punya semester aktif sampai admin menekannya manual. Aktifkan
 * otomatis semester yang mencakup hari ini (atau Semester 1) bila belum ada
 * semester aktif di tahun tersebut. Gagal diam-diam: admin tetap bisa
 * mengaturnya manual di panel Semester.
 */
async function ensureActiveSemester(
  supabase: Awaited<ReturnType<typeof createClient>>,
  yearId: string
) {
  const { data: sems } = await supabase
    .from("academic_semesters")
    .select("id, sequence, start_date, end_date, status")
    .eq("academic_year_id", yearId)
    .order("sequence");
  if (!sems || sems.length === 0 || sems.some((x) => x.status === "AKTIF")) return;

  const today = new Date().toISOString().slice(0, 10);
  const pick = sems.find((x) => x.start_date <= today && today <= x.end_date) ?? sems[0];
  await supabase.rpc("academic_semester_set_active", { p_semester_id: pick.id });
}

/* ---- tanggal (YYYY-MM-DD, dihitung di UTC agar tidak bergeser zona waktu) ---- */
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function isoToMs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function msToIso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDaysIso(iso: string, days: number) {
  return msToIso(isoToMs(iso) + days * 86_400_000);
}
function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate(); // hari terakhir bulan tujuan
  return msToIso(Date.UTC(ny, nm, Math.min(d, last)));
}

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
  for (const v of [startDate, endDate, s1Start, s1End, s2Start, s2End]) {
    if (v && !ISO_RE.test(v)) return { error: "Format tanggal tidak valid." };
  }
  if (endDate <= startDate) return { error: "Tanggal selesai harus setelah tanggal mulai." };

  // Tahun ajaran baru: hitung batas semester di sini (Semester 1 = 6 bulan pertama,
  // atau separuh periode bila tahunnya lebih pendek) supaya tidak melanggar
  // constraint database. Saat edit, hanya tanggal yang diisi admin yang dikirim
  // sehingga pengaturan semester yang sudah ada tidak tertimpa.
  let p1s: string | null = s1Start || null;
  let p1e: string | null = s1End || null;
  let p2s: string | null = s2Start || null;
  let p2e: string | null = s2End || null;

  if (!id) {
    const sixMonthEnd = addDaysIso(addMonthsIso(startDate, 6), -1);
    const halfEnd = addDaysIso(startDate, Math.floor((isoToMs(endDate) - isoToMs(startDate)) / 86_400_000 / 2));
    p1s = p1s ?? startDate;
    p1e = p1e ?? (sixMonthEnd < endDate ? sixMonthEnd : halfEnd);
    p2s = p2s ?? addDaysIso(p1e, 1);
    p2e = p2e ?? endDate;
  }

  const sems: [string, string | null, string | null][] = [
    ["Semester 1", p1s, p1e],
    ["Semester 2", p2s, p2e],
  ];
  for (const [label, a, b] of sems) {
    if (a && b && b < a) return { error: `${label}: tanggal selesai harus setelah tanggal mulai.` };
    for (const v of [a, b]) {
      if (v && (v < startDate || v > endDate)) {
        return { error: `${label}: tanggal harus berada di dalam periode tahun ajaran (${startDate} s/d ${endDate}).` };
      }
    }
  }
  if (p1e && p2s && p2s <= p1e) return { error: "Semester 2 harus dimulai setelah Semester 1 selesai." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("academic_year_save", {
    p_id: id,
    p_name: name,
    p_start: startDate,
    p_end: endDate,
    p_activate: activate,
    p_s1_start: p1s,
    p_s1_end: p1e,
    p_s2_start: p2s,
    p_s2_end: p2e,
  });
  if (error) return fail(error);

  const yearId = (data as string | null) ?? id;
  if (activate && yearId) await ensureActiveSemester(supabase, yearId);

  invalidateAkademik();
  return { success: id ? "Tahun ajaran diperbarui." : `Tahun ajaran ${name} dibuat.`, data: { id: yearId } };
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

  await ensureActiveSemester(supabase, yearId);

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
    "/admin/jadwal",
    "/admin/akademik",
    "/admin/akademik/mutasi",
    "/admin/akademik/arsip",
    "/admin/onboarding",
    "/koordinator/halaqah",
    "/ustadz/halaqah",
    "/ustadz",
    "/santri"
  );
}
