"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import {
  invalidateJournalConfig,
  invalidateJournals,
  invalidateTargets,
  invalidateTasks,
} from "@/lib/cache";
import {
  TARGET_MODULES,
  TASK_STATUSES,
  type JournalFieldDef,
  type JournalFieldType,
} from "@/lib/v7-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V7 — Guru actions for Target / Tugas / Custom Jurnal
 * (rule #41-#42, #55-#56). Every write goes through a SECURITY DEFINER RPC
 * that re-verifies session → role → tenant → teacher identity → assignment.
 * Client-side validation here only gives fast, friendly feedback.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

const V7_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /JUDUL_TIDAK_VALID/, message: "Judul wajib diisi (1-160 karakter)." },
  { match: /PERIODE_TIDAK_VALID/, message: "Periode tidak valid — tanggal akhir tidak boleh sebelum tanggal mulai." },
  { match: /TARGET_TIDAK_VALID/, message: "Nilai target harus angka antara 0 dan 10000." },
  { match: /PROGRESS_TIDAK_VALID/, message: "Nilai progress tidak valid (0 sampai nilai target)." },
  { match: /PROGRESS_MANUAL_SAJA/, message: "Target modul dihitung dari data penilaian. Gunakan tombol Hitung dari Data." },
  { match: /TARGET_TIDAK_DITEMUKAN/, message: "Target tidak ditemukan atau bukan kewenangan Anda." },
  { match: /INSTRUKSI_TIDAK_VALID/, message: "Instruksi tugas wajib diisi (maksimal 1000 karakter)." },
  { match: /DEADLINE_TIDAK_VALID/, message: "Deadline tidak valid." },
  { match: /TUGAS_TIDAK_DITEMUKAN/, message: "Tugas tidak ditemukan atau bukan kewenangan Anda." },
  { match: /STATUS_TIDAK_VALID/, message: "Status tidak valid." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /NAMA_TIDAK_VALID/, message: "Nama template wajib diisi (1-80 karakter)." },
  { match: /FIELD_TIDAK_VALID/, message: "Konfigurasi field tidak valid. Periksa label, tipe, dan pilihan." },
  { match: /TEMPLATE_TIDAK_DITEMUKAN/, message: "Template jurnal tidak ditemukan atau sudah tidak aktif." },
  { match: /TEMPLATE_DIGUNAKAN/, message: "Template sudah memiliki data jurnal. Tidak dapat dihapus — gunakan Nonaktifkan." },
  { match: /ENTRY_TIDAK_DITEMUKAN/, message: "Catatan jurnal tidak ditemukan atau bukan kewenangan Anda." },
  { match: /WAJIB_DIISI/, message: "Ada field wajib yang belum diisi." },
  { match: /NILAI_TIDAK_VALID/, message: "Isi field jurnal tidak sesuai tipe datanya." },
  { match: /TANGGAL_TIDAK_VALID/, message: "Tanggal tidak valid." },
];

function friendlyV7Error(message: string): string {
  for (const { match, message: friendly } of V7_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Data belum berhasil disimpan. Silakan coba lagi."; // rule #46
}

function requireUstadz() {
  return getSessionProfile().then((profile) =>
    profile && profile.role === "USTADZ" && profile.tenantId ? profile : null
  );
}

function validDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/* ------------------------------- TARGET ----------------------------------- */

export async function saveTargetAction(input: {
  studentId: string;
  module: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  targetValue: number;
  unit: string;
  note: string;
  targetId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.studentId)) return { error: "Pilih santri terlebih dahulu." };
  if (input.targetId && !UUID_RE.test(input.targetId)) return { error: "Target tidak valid." };
  const title = input.title.trim();
  if (title.length < 1 || title.length > 160) return { error: "Judul target wajib diisi (1-160 karakter)." };
  if (!(TARGET_MODULES as readonly string[]).includes(input.module)) {
    return { error: "Modul target tidak valid." };
  }
  if (!validDate(input.startDate) || !validDate(input.endDate)) {
    return { error: "Periode target tidak valid." };
  }
  if (input.endDate < input.startDate) {
    return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };
  }
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0 || input.targetValue > 10000) {
    return { error: "Nilai target harus angka lebih dari 0 (maks 10000)." };
  }
  const unit = input.unit.trim().slice(0, 30);
  const description = input.description.trim().slice(0, 500);
  const note = input.note.trim().slice(0, 500);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_save", {
    p_student_id: input.studentId,
    p_module: input.module,
    p_title: title,
    p_description: description || null,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_target_value: input.targetValue,
    p_unit: unit || null,
    p_note: note || null,
    p_target_id: input.targetId ?? null,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTargets([input.studentId]);
  return { success: input.targetId ? "Target berhasil diperbarui." : "Target berhasil dibuat.", id: (data as string) ?? undefined };
}

export async function setTargetProgressAction(input: {
  targetId: string;
  value: number;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.targetId)) return { error: "Target tidak valid." };
  if (!Number.isFinite(input.value) || input.value < 0) {
    return { error: "Nilai progress tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_set_progress", {
    p_target_id: input.targetId,
    p_value: input.value,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTargets([]); // student id resolved server-side; paths revalidated
  return { success: "Progress target diperbarui." };
}

/** Rule #11 — recompute from real assessment data (module targets only). */
export async function refreshTargetProgressAction(input: {
  targetId: string;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.targetId)) return { error: "Target tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_recompute_progress", {
    p_target_id: input.targetId,
    p_source: "AUTO",
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTargets([]);
  return { success: `Progress dihitung ulang dari data: ${Number(data ?? 0)}.` };
}

export async function cancelTargetAction(input: { targetId: string }): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.targetId)) return { error: "Target tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("target_cancel", { p_target_id: input.targetId });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTargets([]);
  return { success: "Target dibatalkan." };
}

/* --------------------------------- TUGAS ---------------------------------- */

export async function saveTaskAction(input: {
  studentId: string;
  module: string;
  title: string;
  description: string;
  instruction: string;
  dueDate: string;
  taskId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.studentId)) return { error: "Pilih santri terlebih dahulu." };
  if (input.taskId && !UUID_RE.test(input.taskId)) return { error: "Tugas tidak valid." };
  const title = input.title.trim();
  if (title.length < 1 || title.length > 160) return { error: "Judul tugas wajib diisi (1-160 karakter)." };
  const instruction = input.instruction.trim();
  if (instruction.length < 1 || instruction.length > 1000) {
    return { error: "Instruksi tugas wajib diisi (maksimal 1000 karakter)." };
  }
  if (!(TARGET_MODULES as readonly string[]).includes(input.module)) {
    return { error: "Modul tugas tidak valid." };
  }
  if (!validDate(input.dueDate)) return { error: "Deadline tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_save", {
    p_student_id: input.studentId,
    p_module: input.module,
    p_title: title,
    p_description: input.description.trim().slice(0, 500) || null,
    p_instruction: instruction,
    p_due_date: input.dueDate,
    p_task_id: input.taskId ?? null,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTasks([input.studentId]);
  return { success: input.taskId ? "Tugas berhasil diperbarui." : "Tugas berhasil dibuat.", id: (data as string) ?? undefined };
}

/** Status/grade update — grading validated against the V3 engine by the RPC. */
export async function setTaskStatusAction(input: {
  taskId: string;
  status: string;
  scoreValue: number | null;
  scoreLabel: string;
  completionNote: string;
  teacherNote: string;
}): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.taskId)) return { error: "Tugas tidak valid." };
  if (!(TASK_STATUSES as readonly string[]).includes(input.status)) {
    return { error: "Status tugas tidak valid." };
  }
  if (
    input.scoreValue !== null &&
    (!Number.isInteger(input.scoreValue) || input.scoreValue < 1 || input.scoreValue > 100)
  ) {
    return { error: "Nilai harus angka 1-100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_status", {
    p_task_id: input.taskId,
    p_status: input.status,
    p_score_value: input.scoreValue,
    p_score_label: input.scoreLabel || null,
    p_completion_note: input.completionNote.trim().slice(0, 500) || null,
    p_teacher_note: input.teacherNote.trim().slice(0, 500) || null,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateTasks([]); // student id resolved by the RPC revalidation paths
  return { success: "Status tugas diperbarui." };
}

/* ----------------------------- CUSTOM JURNAL ------------------------------ */

function validateFieldDefs(fields: JournalFieldDef[]): string | null {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 40) {
    return "Tambahkan minimal satu field (maksimal 40).";
  }
  for (const f of fields) {
    const label = (f.label ?? "").trim();
    if (label.length < 1 || label.length > 80) return "Label field wajib diisi (1-80 karakter).";
    const type = f.type as JournalFieldType;
    if (!["TEXT", "NUMBER", "SELECT", "CHECKBOX", "DATE", "TEXTAREA"].includes(type)) {
      return "Tipe field tidak valid.";
    }
    if (type === "SELECT") {
      const opts = (f.options ?? []).map((o) => (o ?? "").trim()).filter(Boolean);
      if (opts.length === 0 || opts.length > 20) {
        return `Field pilihan \"${label}\" butuh 1-20 opsi.`;
      }
      if (opts.some((o) => o.length > 80)) return `Opsi pada \"${label}\" terlalu panjang.`;
    }
  }
  return null;
}

export async function saveJournalTemplateAction(input: {
  templateId?: string | null;
  name: string;
  description: string;
  showInAchievement: boolean;
  fields: JournalFieldDef[];
}): Promise<ActionResult & { id?: string }> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Akses ditolak." };
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) return { error: "Nama template wajib diisi (1-80 karakter)." };
  const fieldError = validateFieldDefs(input.fields);
  if (fieldError) return { error: fieldError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_template_save", {
    p_template_id: input.templateId ?? null,
    p_name: name,
    p_description: input.description.trim().slice(0, 300) || null,
    p_show_in_achievement: input.showInAchievement,
    p_fields: input.fields.map((f) => ({
      label: f.label.trim(),
      type: f.type,
      required: !!f.required,
      options: f.type === "SELECT" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : null,
    })),
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournalConfig(profile.tenantCode);
  return {
    success: input.templateId ? "Template jurnal diperbarui." : "Template jurnal dibuat.",
    id: (data as string) ?? undefined,
  };
}

export async function setJournalTemplateActiveAction(input: {
  templateId: string;
  active: boolean;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("journal_template_set_active", {
    p_template_id: input.templateId,
    p_active: input.active,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournalConfig(profile.tenantCode);
  return { success: input.active ? "Template diaktifkan." : "Template dinonaktifkan." };
}

export async function moveJournalTemplateAction(input: {
  templateId: string;
  direction: "UP" | "DOWN";
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("journal_template_move", {
    p_template_id: input.templateId,
    p_direction: input.direction,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournalConfig(profile.tenantCode);
  return { success: "Urutan template diperbarui." };
}

export async function deleteJournalTemplateAction(input: {
  templateId: string;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };
  if (!UUID_RE.test(input.templateId)) return { error: "Template tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("journal_template_delete", { p_template_id: input.templateId });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournalConfig(profile.tenantCode);
  return { success: "Template dihapus." };
}

export async function saveJournalEntryAction(input: {
  templateId: string;
  studentId: string;
  entryDate: string;
  values: Record<string, unknown>;
  freeText: string;
  entryId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };

  if (!UUID_RE.test(input.templateId) || !UUID_RE.test(input.studentId)) {
    return { error: "Pilih template dan santri terlebih dahulu." };
  }
  if (input.entryId && !UUID_RE.test(input.entryId)) return { error: "Catatan tidak valid." };
  if (!validDate(input.entryDate)) return { error: "Tanggal jurnal tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("journal_entry_save", {
    p_template_id: input.templateId,
    p_student_id: input.studentId,
    p_entry_date: input.entryDate,
    p_values: input.values ?? {},
    p_free_text: input.freeText.trim().slice(0, 500) || null,
    p_entry_id: input.entryId ?? null,
  });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournals([input.studentId]);
  return {
    success: input.entryId ? "Jurnal berhasil diperbarui." : "Jurnal berhasil disimpan.",
    id: (data as string) ?? undefined,
  };
}

export async function deleteJournalEntryAction(input: { entryId: string }): Promise<ActionResult> {
  const profile = await requireUstadz();
  if (!profile) return { error: "Session Anda telah berakhir. Silakan login kembali." };
  if (!UUID_RE.test(input.entryId)) return { error: "Catatan tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("journal_soft_delete", { p_entry_id: input.entryId });
  if (error) return { error: friendlyV7Error(error.message) };

  invalidateJournals([]);
  return { success: "Jurnal diarsipkan." };
}
