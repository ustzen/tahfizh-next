"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateLearningAssessments, invalidateSetoranAssessments } from "@/lib/cache";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V12.11 — Setoran Hadits & Doa Harian (tab 2 & 3 menu Setoran).
 *
 * Satu setoran guru di menu Setoran → OTOMATIS tersimpan di modul terkait
 * (tabel `learning_assessments` lewat RPC `learning_save_assessment` yang
 * sudah ada) — sehingga langsung tampil di menu Hadits/Doa, riwayat modul,
 * dan dasbor santri. Guru bebas memilih mode nilai per setoran
 * (Centang/Huruf/Angka). Catatan terstruktur + template cepat per slot.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

const MODULE_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN|SANTRI_TIDAK_DITEMUKAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /MATERI_TIDAK_AKTIF/, message: "Materi ini sudah tidak digunakan oleh lembaga." },
  { match: /MODUL_TIDAK_VALID/, message: "Modul pembelajaran tidak valid." },
  { match: /STATUS_TIDAK_VALID/, message: "Status penilaian tidak valid untuk modul ini." },
  { match: /TANGGAL_TIDAK_VALID/, message: "Tanggal setoran tidak valid (maksimal 7 hari ke depan atau 1 tahun ke belakang)." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /CATATAN_TIDAK_VALID/, message: "Isi catatan tidak valid." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of MODULE_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Setoran belum berhasil disimpan. Silakan coba lagi.";
}

export type SetoranLearningNoteInput = { slot: string; content: string };

/** Slot catatan valid per modul (sama dengan RPC learning_save_assessment). */
const HADITS_SLOTS = ["APRESIASI", "HAFALAN", "BACAAN", "SARAN", "CATATAN_ORANG_TUA"];
const DOA_SLOTS = ["APRESIASI", "HAFALAN", "PELAFALAN", "PENGAMALAN", "CATATAN_ORANG_TUA"];

/** Status default setoran per modul (setoran = sesi hafalan; LULUS = menguasai). */
const SETORAN_STATUS: Record<"HADITS" | "DOA", Record<string, string>> = {
  HADITS: {
    LULUS: "LULUS",
    PERLU_MENGULANG: "PERLU_MENGULANG",
    DITUNDA: "BELUM_SELESAI",
  },
  DOA: {
    LULUS: "LULUS",
    PERLU_MENGULANG: "PERLU_MENGULANG",
    DITUNDA: "BELUM_SELESAI",
  },
};

export async function saveSetoranLearningAction(input: {
  module: "HADITS" | "DOA";
  studentId: string;
  materialId: string;
  assessedDate: string; // yyyy-mm-dd
  result: "LULUS" | "PERLU_MENGULANG" | "DITUNDA";
  mode: "CENTANG" | "HURUF" | "ANGKA";
  scoreValue: number | null;
  scoreLabel: string;
  freeNote: string;
  notes: SetoranLearningNoteInput[];
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (input.module !== "HADITS" && input.module !== "DOA") {
    return { error: "Modul setoran tidak valid." };
  }
  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.materialId)) {
    return { error: "Data setoran tidak valid." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assessedDate) || Number.isNaN(Date.parse(input.assessedDate))) {
    return { error: "Tanggal setoran tidak valid." };
  }
  if (input.mode === "ANGKA" && input.result !== "DITUNDA" && (input.scoreValue === null || input.scoreValue < 1 || input.scoreValue > 100)) {
    return { error: "Nilai harus angka 1-100." };
  }
  if (input.mode === "HURUF" && input.result !== "DITUNDA" && !input.scoreLabel) {
    return { error: "Pilih grade huruf untuk setoran ini." };
  }

  const freeNote = input.freeNote.trim();
  if (freeNote.length > 500) return { error: "Catatan maksimal 500 karakter." };

  const validSlots = input.module === "HADITS" ? HADITS_SLOTS : DOA_SLOTS;
  const notesPayload: Record<string, string> = {};
  for (const n of input.notes ?? []) {
    const content = (n.content ?? "").trim();
    if (!content) continue;
    if (!validSlots.includes(n.slot)) return { error: "Isi catatan tidak valid." };
    if (content.length > 500) return { error: "Catatan maksimal 500 karakter." };
    notesPayload[n.slot] = content;
  }
  if (Object.keys(notesPayload).length > 5) {
    return { error: "Isi catatan tidak valid." };
  }

  const status = SETORAN_STATUS[input.module][input.result] ?? "LULUS";

  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_save_assessment", {
    p_student_id: input.studentId,
    p_module: input.module,
    p_material_id: input.materialId,
    p_assessed_date: input.assessedDate,
    p_status: status,
    p_score_value: input.mode === "ANGKA" && input.result !== "DITUNDA" ? input.scoreValue : null,
    p_score_label: input.mode === "HURUF" && input.result !== "DITUNDA" ? input.scoreLabel || null : null,
    p_free_note: freeNote || null,
    p_notes: notesPayload,
    p_assessment_id: null,
    p_mode: input.mode,
  });

  if (error) return { error: friendlyError(error.message) };

  // Sinkron cache: menu Hadits/Doa + dasbor santri refresh seketika.
  invalidateLearningAssessments([input.studentId], input.module);
  invalidateSetoranAssessments([input.studentId]);
  return { success: input.module === "HADITS" ? "Setoran hadits tersimpan." : "Setoran doa tersimpan." };
}
