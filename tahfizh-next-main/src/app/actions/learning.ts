"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateLearningAssessments } from "@/lib/cache";
import { LEARNING_MODULES, type LearningModule } from "@/lib/learning-shared";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V6 — Guru learning actions (Hadits/Doa/Tajwid; rule #7, #44-#47, #50).
 * All writes go through the transactional RPC which re-verifies session,
 * role, tenant, teacher identity, assignment, material status, status
 * vocabulary and the V3 scoring rules.
 */

const LEARNING_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN|SANTRI_TIDAK_DITEMUKAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /MATERI_TIDAK_AKTIF/, message: "Materi ini sudah tidak digunakan oleh lembaga." },
  { match: /MODUL_TIDAK_VALID/, message: "Modul pembelajaran tidak valid." },
  { match: /STATUS_TIDAK_VALID/, message: "Status penilaian tidak valid untuk modul ini." },
  { match: /TANGGAL_TIDAK_VALID/, message: "Tanggal penilaian tidak valid (maksimal 7 hari ke depan atau 1 tahun ke belakang)." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /CATATAN_TIDAK_VALID/, message: "Isi catatan tidak valid." },
  { match: /ASSESSMENT_TIDAK_DITEMUKAN/, message: "Penilaian tidak ditemukan atau bukan kewenangan Anda." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of LEARNING_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Data belum berhasil disimpan. Silakan coba lagi."; // rule #46
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type LearningNoteInput = { slot: string; content: string };

/**
 * Save (create or edit) a learning assessment for one of the three modules.
 * Rule #45: "Menyimpan…" + disabled button; #46: values survive failures.
 * V12.7: ADMIN & KOORDINATOR lembaga juga boleh menilai; mode penilaian bebas
 * dipilih per penilaian (p_mode — RPC memakai mode lembaga bila kosong).
 */
export async function saveLearningAssessmentAction(input: {
  module: LearningModule;
  studentId: string;
  materialId: string;
  assessedDate: string; // yyyy-mm-dd
  status: string;
  mode?: "CENTANG" | "HURUF" | "ANGKA" | null; // V12.7: mode bebas (null = mode lembaga)
  scoreValue: number | null;
  scoreLabel: string;
  freeNote: string;
  notes: LearningNoteInput[];
  assessmentId?: string | null; // set = edit own record
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !("USTADZ" === profile.role || "ADMIN" === profile.role || "KOORDINATOR" === profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  const mode = input.mode ?? null;
  if (mode === "ANGKA" && (input.scoreValue === null || input.scoreValue < 1 || input.scoreValue > 100)) {
    return { error: "Nilai harus angka 1-100." };
  }
  if (mode === "HURUF" && !input.scoreLabel) {
    return { error: "Pilih grade huruf untuk penilaian ini." };
  }

  if (!(LEARNING_MODULES as readonly string[]).includes(input.module)) {
    return { error: "Modul pembelajaran tidak valid." };
  }
  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.materialId)) {
    return { error: "Data penilaian tidak valid." };
  }
  if (input.assessmentId && !UUID_RE.test(input.assessmentId)) {
    return { error: "Data penilaian tidak valid." };
  }
  // Rule #44: valid calendar date (RPC re-validates authoritatively).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assessedDate) || Number.isNaN(Date.parse(input.assessedDate))) {
    return { error: "Tanggal penilaian tidak valid." };
  }

  const freeNote = input.freeNote.trim();
  if (freeNote.length > 500) return { error: "Catatan maksimal 500 karakter." };

  // Structured notes: ≤ 5 slots, each ≤ 500 chars (slot vocabulary checked by RPC).
  const notesPayload: Record<string, string> = {};
  for (const n of input.notes ?? []) {
    const content = (n.content ?? "").trim();
    if (!content) continue;
    if (content.length > 500) return { error: "Catatan maksimal 500 karakter." };
    notesPayload[n.slot] = content;
  }
  if (Object.keys(notesPayload).length > 5) {
    return { error: "Isi catatan tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_save_assessment", {
    p_student_id: input.studentId,
    p_module: input.module,
    p_material_id: input.materialId,
    p_assessed_date: input.assessedDate,
    p_status: input.status,
    p_score_value: mode === "ANGKA" ? input.scoreValue : null,
    p_score_label: mode === "HURUF" ? input.scoreLabel || null : null,
    p_free_note: freeNote || null,
    p_notes: notesPayload,
    p_assessment_id: input.assessmentId ?? null,
    p_mode: mode,
  });

  if (error) return { error: friendlyError(error.message) };

  // Rule #38: summary, module history and Kartu Prestasi refresh immediately.
  invalidateLearningAssessments([input.studentId], input.module);
  return {
    success:
      input.assessmentId
        ? "Penilaian berhasil diperbarui."
        : "Penilaian berhasil disimpan.", // rule #45
  };
}

/** Soft delete (rule #48) — history & Kartu Prestasi stay consistent. */
export async function deleteLearningAssessmentAction(
  assessmentId: string,
  module: LearningModule
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!UUID_RE.test(assessmentId)) return { error: "Penilaian tidak valid." };

  const supabase = await createClient();

  // Need the student id for cache invalidation (RLS-scoped read).
  const { data: row } = await supabase
    .from("learning_assessments")
    .select("student_id")
    .eq("id", assessmentId)
    .maybeSingle();

  const { error } = await supabase.rpc("learning_soft_delete_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) return { error: friendlyError(error.message) };

  if (row?.student_id) invalidateLearningAssessments([row.student_id as string], module);
  return { success: "Penilaian diarsipkan." };
}
