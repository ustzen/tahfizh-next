"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateAttendance, invalidateHalaqah } from "@/lib/cache";
import type { AttendanceStatus } from "@/lib/halaqah-shared";
import type { ActionResult } from "@/app/actions/crud";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const HALAQAH_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK/, message: "Anda tidak memiliki akses ke halaqah ini." },
  { match: /HALAQAH_TIDAK_DITEMUKAN/, message: "Halaqah tidak ditemukan di lembaga Anda." },
  { match: /NAMA_TIDAK_VALID/, message: "Nama halaqah wajib diisi (2-120 karakter)." },
  { match: /GURU_TIDAK_DITEMUKAN/, message: "Guru pengampu tidak valid." },
  { match: /SANTRI_TIDAK_DITEMUKAN/, message: "Ada santri yang tidak valid pada daftar anggota." },
  { match: /HALAQAH_DIGUNAKAN/, message: "Halaqah sudah dipakai (anggota/presensi). Nonaktifkan saja." },
  { match: /TANGGAL_TIDAK_VALID|DATA_TIDAK_VALID/, message: "Data presensi tidak valid." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of HALAQAH_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Data belum berhasil disimpan. Silakan coba lagi."; // rule #58
}

/* ------------------------------ HALAQAH CRUD ------------------------------ */

export async function saveHalaqahAction(input: {
  halaqahId?: string | null;
  name: string;
  description: string;
}): Promise<ActionResult & { id?: string }> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    return { error: "Nama halaqah wajib diisi (2-120 karakter)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("halaqah_save", {
    p_halaqah_id: input.halaqahId ?? null,
    p_name: name,
    p_description: input.description.trim().slice(0, 300) || null,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateHalaqah(profile.tenantCode);
  return {
    success: input.halaqahId ? "Halaqah diperbarui." : "Halaqah dibuat.",
    id: (data as string) ?? undefined,
  };
}

export async function setHalaqahActiveAction(input: {
  halaqahId: string;
  active: boolean;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("halaqah_set_active", {
    p_halaqah_id: input.halaqahId,
    p_active: input.active,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateHalaqah(profile.tenantCode, [input.halaqahId]);
  return { success: input.active ? "Halaqah diaktifkan." : "Halaqah dinonaktifkan." };
}

export async function deleteHalaqahAction(input: { halaqahId: string }): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("halaqah_delete", { p_halaqah_id: input.halaqahId });
  if (error) return { error: friendlyError(error.message) };

  invalidateHalaqah(profile.tenantCode, [input.halaqahId]);
  return { success: "Halaqah dihapus." };
}

export async function setHalaqahTeachersAction(input: {
  halaqahId: string;
  teacherIds: string[];
  primaryId?: string | null;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (input.teacherIds.length === 0 || !input.teacherIds.every((id) => UUID_RE.test(id))) {
    return { error: "Pilih minimal satu guru pengampu." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("halaqah_set_teachers", {
    p_halaqah_id: input.halaqahId,
    p_teacher_ids: input.teacherIds,
    p_primary_id: input.primaryId ?? null,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateHalaqah(profile.tenantCode, [input.halaqahId]);
  return { success: "Guru pengampu diperbarui." };
}

export async function setHalaqahMembersAction(input: {
  halaqahId: string;
  studentIds: string[];
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!input.studentIds.every((id) => UUID_RE.test(id))) {
    return { error: "Ada santri yang tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("halaqah_set_members", {
    p_halaqah_id: input.halaqahId,
    p_student_ids: input.studentIds,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateHalaqah(profile.tenantCode, [input.halaqahId]);
  return { success: "Anggota halaqah diperbarui — histori perpindahan tetap tersimpan." };
}

export async function moveStudentHalaqahAction(input: {
  studentId: string;
  toHalaqahId: string;
  fromHalaqahId?: string | null;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "DEVELOPER")) {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.toHalaqahId)) {
    return { error: "Data tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("halaqah_move_student", {
    p_student_id: input.studentId,
    p_to_halaqah: input.toHalaqahId,
  });
  if (error) return { error: friendlyError(error.message) };

  // rule #51: invalidate BOTH old and new halaqah.
  invalidateHalaqah(profile.tenantCode, [input.toHalaqahId, ...(input.fromHalaqahId ? [input.fromHalaqahId] : [])]);
  return { success: "Santri dipindahkan — histori halaqah lama tetap tersimpan." };
}

/* ---------------------------- PRESENSI (BATCH) ----------------------------- */

export type AttendanceRecordInput = {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
};

/**
 * ONE batch call for the whole class (rule #21): 30 santri = 1 request, never
 * 30. The RPC upserts session + all records + audit in a single transaction.
 */
export async function saveAttendanceBatchAction(input: {
  halaqahId: string;
  date: string;
  generalNote: string;
  records: AttendanceRecordInput[];
}): Promise<ActionResult & { saved?: number }> {
  const profile = await getSessionProfile();
  if (!profile || profile.role === "WALI_SANTRI") {
    return { error: "Anda tidak memiliki akses." };
  }
  if (!UUID_RE.test(input.halaqahId)) return { error: "Halaqah tidak valid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal tidak valid." };
  if (input.records.length === 0) return { error: "Belum ada data presensi untuk disimpan." };
  if (input.records.length > 200) return { error: "Terlalu banyak santri dalam satu kali simpan." };
  if (!input.records.every((r) => UUID_RE.test(r.studentId))) {
    return { error: "Ada santri yang tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_save_batch", {
    p_halaqah_id: input.halaqahId,
    p_date: input.date,
    p_general_note: input.generalNote.trim().slice(0, 500) || null,
    p_records: input.records.map((r) => ({
      studentId: r.studentId,
      status: r.status,
      note: r.note?.slice(0, 300) ?? null,
    })),
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateAttendance(input.halaqahId, input.records.map((r) => r.studentId));
  return { success: "Presensi berhasil disimpan.", saved: Number(data ?? 0) };
}
