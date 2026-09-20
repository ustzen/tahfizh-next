"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateSetoranAssessments } from "@/lib/cache";
import { SUBMISSION_NOTE_SLOTS, type SubmissionNoteSlot } from "@/lib/setoran";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V5 — Guru Setoran actions (rule #6-#12, #27, #44-#49).
 * All writes go through the transactional RPC which re-verifies session,
 * role, tenant, teacher identity, assignment, surah status and scoring rules.
 */

const SETORAN_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN|SANTRI_TIDAK_DITEMUKAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /SURAT_TIDAK_AKTIF/, message: "Surat ini sudah tidak digunakan oleh lembaga." },
  { match: /JENIS_TIDAK_VALID/, message: "Jenis setoran tidak valid." },
  { match: /STATUS_TIDAK_VALID/, message: "Status setoran tidak valid." },
  { match: /TANGGAL_TIDAK_VALID/, message: "Tanggal setoran tidak valid (maksimal 7 hari ke depan atau 1 tahun ke belakang)." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /CATATAN_TIDAK_VALID/, message: "Isi catatan tidak valid." },
  { match: /AYAT_TERLALU_PANJANG/, message: "Ayat/bagian maksimal 60 karakter." },
  { match: /SUBMISSION_TIDAK_DITEMUKAN/, message: "Setoran tidak ditemukan atau bukan kewenangan Anda." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of SETORAN_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Setoran belum berhasil disimpan. Silakan coba lagi."; // rule #45
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type SetoranNoteInput = { slot: SubmissionNoteSlot; content: string };

/**
 * Save (create or edit) a setoran. The form keeps its values on failure
 * (rule #45) and the button shows "Menyimpan…" while pending (rule #46).
 * Rule #48: the RPC writes row + notes + history in ONE transaction.
 */
export async function saveSetoranAction(input: {
  studentId: string;
  tenantSurahId: string;
  kind: string;
  ayatLabel: string;
  assessedDate: string; // yyyy-mm-dd
  result: string;
  scoreValue: number | null;
  scoreLabel: string;
  freeNote: string;
  notes: SetoranNoteInput[];
  submissionId?: string | null; // set = edit
  mode?: "CENTANG" | "HURUF" | "ANGKA" | null; // V12.11: mode bebas per setoran
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.tenantSurahId)) {
    return { error: "Data setoran tidak valid." };
  }
  if (input.submissionId && !UUID_RE.test(input.submissionId)) {
    return { error: "Data setoran tidak valid." };
  }
  if (!["HAFALAN_BARU", "MUROJAAH"].includes(input.kind)) {
    return { error: "Jenis setoran tidak valid." };
  }
  if (!["LULUS", "PERLU_MENGULANG", "DITUNDA"].includes(input.result)) {
    return { error: "Status setoran tidak valid." };
  }

  // Rule #8: valid calendar date (RPC re-validates authoritatively).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assessedDate) || Number.isNaN(Date.parse(input.assessedDate))) {
    return { error: "Tanggal setoran tidak valid." };
  }

  const ayat = input.ayatLabel.trim();
  if (ayat.length > 60) return { error: "Ayat/bagian maksimal 60 karakter." };
  const freeNote = input.freeNote.trim();
  if (freeNote.length > 500) return { error: "Catatan maksimal 500 karakter." };

  // Structured notes: valid slots only, each ≤ 500 chars, ≤ 5 slots.
  const notesPayload: Record<string, string> = {};
  for (const n of input.notes ?? []) {
    const content = (n.content ?? "").trim();
    if (!content) continue;
    if (!(SUBMISSION_NOTE_SLOTS as readonly string[]).includes(n.slot)) {
      return { error: "Isi catatan tidak valid." };
    }
    if (content.length > 500) return { error: "Catatan maksimal 500 karakter." };
    notesPayload[n.slot] = content;
  }
  if (Object.keys(notesPayload).length > 5) {
    return { error: "Isi catatan tidak valid." };
  }

  const supabase = await createClient();
  const mode = input.mode ?? null;
  // V12.11: mode bebas — validasi mengikuti mode terpilih (bukan hanya mode lembaga).
  if (mode === "ANGKA" && input.result !== "DITUNDA" && (input.scoreValue === null || input.scoreValue < 1 || input.scoreValue > 100)) {
    return { error: "Nilai harus angka 1-100." };
  }
  if (mode === "HURUF" && input.result !== "DITUNDA" && !input.scoreLabel) {
    return { error: "Pilih grade huruf untuk setoran ini." };
  }
  const { data, error } = await supabase.rpc("tahfidz_save_submission", {
    p_student_id: input.studentId,
    p_tenant_surah_id: input.tenantSurahId,
    p_kind: input.kind,
    p_ayat_label: ayat || null,
    p_assessed_date: input.assessedDate,
    p_result: input.result,
    p_score_value: mode === "ANGKA" && input.result !== "DITUNDA" ? input.scoreValue : null,
    p_score_label: mode === "HURUF" && input.result !== "DITUNDA" ? input.scoreLabel || null : null,
    p_free_note: freeNote || null,
    p_notes: notesPayload,
    p_submission_id: input.submissionId ?? null,
    p_mode: mode,
  });

  if (error) return { error: friendlyError(error.message) };

  // Rule #37: list, detail, summary and Kartu Prestasi refresh immediately.
  invalidateSetoranAssessments([input.studentId]);
  return {
    success:
      input.submissionId
        ? "Setoran berhasil diperbarui."
        : "Setoran berhasil disimpan.", // rule #44
  };
}

/** Soft delete (rule #28) — history & Kartu Prestasi stay consistent. */
export async function deleteSetoranAction(submissionId: string): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!UUID_RE.test(submissionId)) return { error: "Setoran tidak valid." };

  const supabase = await createClient();

  // Need the student id for cache invalidation (RLS-scoped read).
  const { data: row } = await supabase
    .from("tahfidz_submissions")
    .select("student_id")
    .eq("id", submissionId)
    .maybeSingle();

  const { error } = await supabase.rpc("tahfidz_soft_delete_submission", {
    p_submission_id: submissionId,
  });
  if (error) return { error: friendlyError(error.message) };

  if (row?.student_id) invalidateSetoranAssessments([row.student_id as string]);
  return { success: "Setoran diarsipkan." };
}
