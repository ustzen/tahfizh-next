"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateTahfidzAssessments } from "@/lib/cache";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V3 — Guru assessment actions (rules #26-#29, #35).
 * The RPC re-verifies session, role, tenant, teacher identity, assignment,
 * and mode-based validation server-side — the client only sends IDs + input.
 */

const USTADZ_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN|SANTRI_TIDAK_DITEMUKAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /SURAT_TIDAK_AKTIF/, message: "Surat ini sudah tidak digunakan oleh lembaga." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /STATUS_TIDAK_VALID/, message: "Status penilaian tidak valid." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /BATCH_KOSONG|BATCH_TERLALU_BESAR/, message: "Daftar penilaian tidak valid." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of USTADZ_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Penilaian belum berhasil disimpan. Silakan coba lagi.";
}

function validateNote(note: string): string | null {
  if (note.length > 500) return "Catatan maksimal 500 karakter.";
  return null;
}

export async function saveAssessmentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const tenantSurahId = String(formData.get("tenantSurahId") ?? "");
  const status = String(formData.get("status") ?? "DINILAI");
  const rawValue = String(formData.get("scoreValue") ?? "").trim();
  const scoreLabel = String(formData.get("scoreLabel") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(tenantSurahId)) {
    return { error: "Data penilaian tidak valid." };
  }
  if (!["BELUM", "DIPELAJARI", "DINILAI"].includes(status)) {
    return { error: "Status penilaian tidak valid." };
  }
  const noteErr = validateNote(note);
  if (noteErr) return { error: noteErr };

  // Client-side pre-check of the number format; the RPC is authoritative.
  let scoreValue: number | null = null;
  if (rawValue !== "") {
    if (!/^\d+$/.test(rawValue)) return { error: "Nilai harus angka 1-100." };
    scoreValue = Number(rawValue);
    if (scoreValue < 1 || scoreValue > 100) return { error: "Nilai harus angka 1-100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("tahfidz_save_assessment", {
    p_student_id: studentId,
    p_tenant_surah_id: tenantSurahId,
    p_status: status,
    p_score_value: scoreValue,
    p_score_label: scoreLabel || null,
    p_note: note || null,
  });

  if (error) return { error: friendlyError(error.message) };

  invalidateTahfidzAssessments([studentId]);
  return { success: "Penilaian tersimpan." };
}

export async function saveAssessmentsBulkAction(
  items: {
    studentId: string;
    tenantSurahId: string;
    status: string;
    scoreValue: number | null;
    scoreLabel: string | null;
    note?: string | null;
  }[]
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return { error: "Daftar penilaian tidak valid." };
  }

  const uuidRe = /^[0-9a-f-]{36}$/i;
  const payload = items.map((it) => {
    const note = (it.note ?? "").trim();
    return {
      student_id: it.studentId,
      tenant_surah_id: it.tenantSurahId,
      status: it.status,
      score_value: it.scoreValue,
      score_label: it.scoreLabel,
      note: note || null,
    };
  });

  for (const p of payload) {
    if (!uuidRe.test(p.student_id) || !uuidRe.test(p.tenant_surah_id)) {
      return { error: "Data penilaian tidak valid." };
    }
    if (!["BELUM", "DIPELAJARI", "DINILAI"].includes(p.status)) {
      return { error: "Status penilaian tidak valid." };
    }
    const noteErr = validateNote(p.note ?? "");
    if (noteErr) return { error: noteErr };
    if (p.status === "DINILAI" && p.score_value !== null) {
      if (!Number.isInteger(p.score_value) || p.score_value < 1 || p.score_value > 100) {
        return { error: "Nilai harus angka 1-100." };
      }
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("tahfidz_save_assessments_bulk", { p_items: payload });
  if (error) return { error: friendlyError(error.message) };

  invalidateTahfidzAssessments([...new Set(items.map((i) => i.studentId))]);
  return { success: `${items.length} penilaian tersimpan.` };
}
