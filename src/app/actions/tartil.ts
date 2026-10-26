"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { invalidateTartilAssessments } from "@/lib/cache";
import { NOTE_SLOTS, type NoteSlot } from "@/lib/tartil";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V4 — Guru Tartil actions (rules #9-#11, #23, #30, #34-#40).
 * All writes go through the transactional RPC which re-verifies session,
 * role, tenant, teacher identity, assignment, and scoring rules.
 */

const TARTIL_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /AKSES_DITOLAK|GURU_TIDAK_DITEMUKAN/, message: "Session Anda telah berakhir atau profil guru tidak ditemukan. Silakan login kembali." },
  { match: /SANTRI_BUKAN_BINAAN|SANTRI_TIDAK_DITEMUKAN/, message: "Santri bukan binaan Anda atau sudah tidak terdaftar." },
  { match: /MATERI_TIDAK_AKTIF/, message: "Materi ini sudah tidak digunakan oleh lembaga." },
  { match: /NILAI_ANGKA_TIDAK_VALID/, message: "Nilai harus angka 1-100." },
  { match: /NILAI_TIDAK_VALID/, message: "Nilai belum diisi dengan benar — isi nilai untuk santri yang dinilai." },
  { match: /GRADE_TIDAK_VALID/, message: "Grade tidak valid untuk lembaga ini." },
  { match: /STATUS_TIDAK_VALID/, message: "Status penilaian tidak valid." },
  { match: /CATATAN_TERLALU_PANJANG/, message: "Catatan maksimal 500 karakter." },
  { match: /CATATAN_TIDAK_VALID/, message: "Isi catatan tidak valid." },
  { match: /BATCH_KOSONG|BATCH_TERLALU_BESAR/, message: "Daftar penilaian tidak valid." },
  { match: /TANGGAL_TIDAK_VALID|TANGGAL_MASSAL_TIDAK_VALID/, message: "Tanggal penilaian tidak boleh di masa depan." },
  { match: /PENILAIAN_TIDAK_DITEMUKAN/, message: "Penilaian tidak ditemukan atau bukan milik Anda." },
  { match: /Could not find the function|does not exist|PGRST202/i, message: "Fitur Tartil butuh pembaruan skema database — minta Admin menjalankan ulang supabase/tahfizh-combined.sql di Supabase SQL Editor, lalu coba lagi." },
];

function friendlyError(message: string): string {
  for (const { match, message: friendly } of TARTIL_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  return "Penilaian belum berhasil disimpan. Silakan coba lagi.";
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V68/V69 — tanggal override (YYYY-MM-DD → timestamptz). null/"" = pakai waktu
 * sekarang. Validasi: format, bukan masa depan (batas: hari ini zona WIB).
 */
function assessedDateToTz(assessedAt?: string | null): string | { error: string } | null {
  const dateInput = (assessedAt ?? "").trim();
  if (dateInput === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || Number.isNaN(Date.parse(`${dateInput}T00:00:00Z`))) {
    return { error: "Tanggal penilaian tidak valid." };
  }
  const todayWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (dateInput > todayWib) {
    return { error: "Tanggal tidak boleh di masa depan." };
  }
  // Tengah hari 00:00 UTC tetap tampil sebagai tanggal yang dipilih di zona WIB.
  return `${dateInput}T00:00:00+00:00`;
}

export type TartilNoteInput = { slot: NoteSlot; content: string };

const VALID_TARTIL_MODES = ["CENTANG", "HURUF", "ANGKA"] as const;

/**
 * V12.16 — Admin mengubah mode nilai TARTIL (per lembaga, tabel
 * tartil_settings) — terpisah dari mode Tahfidz. Aman dipanggil kapan saja:
 * penilaian yang sudah ada TIDAK diubah (rule #12-#22) — hanya menentukan
 * format input penilaian baru.
 */
export async function setTartilModeAction(
  mode: string
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Akses ditolak." };
  }
  if (!(VALID_TARTIL_MODES as readonly string[]).includes(mode)) {
    return { error: "Mode tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_settings")
    .upsert(
      { tenant_id: profile.tenantId, mode },
      { onConflict: "tenant_id" }
    );
  if (error) return { error: "Gagal menyimpan mode nilai Tartil." };
  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
  return { success: "Mode nilai Tartil disimpan." };
}

/**
 * Save (create or edit) a Tartil assessment. The form keeps its values on
 * failure (rule #37); the button shows "Menyimpan…" while pending (rule #35).
 */
export async function saveTartilAssessmentAction(input: {
  studentId: string;
  materialId: string;
  pagesLabel: string;
  status: string;
  scoreValue: number | null;
  scoreLabel: string;
  freeNote: string;
  notes: TartilNoteInput[];
  assessmentId?: string | null; // set = edit
  /** V69 — tanggal penilaian (YYYY-MM-DD); kosong = hari ini/waktu sekarang. */
  assessedAt?: string | null;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  if (!UUID_RE.test(input.studentId) || !UUID_RE.test(input.materialId)) {
    return { error: "Data penilaian tidak valid." };
  }
  if (!["BELUM", "DIPELAJARI", "DINILAI"].includes(input.status)) {
    return { error: "Status penilaian tidak valid." };
  }
  const pages = input.pagesLabel.trim();
  if (pages.length > 60) return { error: "Halaman/bagian maksimal 60 karakter." };
  const freeNote = input.freeNote.trim();
  if (freeNote.length > 500) return { error: "Catatan maksimal 500 karakter." };

  // Structured notes: max 5 slots, each ≤ 500 chars, slots must be valid.
  const notesPayload: Record<string, string> = {};
  for (const n of input.notes ?? []) {
    const content = (n.content ?? "").trim();
    if (!content) continue;
    if (!(NOTE_SLOTS as readonly string[]).includes(n.slot)) {
      return { error: "Isi catatan tidak valid." };
    }
    if (content.length > 500) return { error: "Catatan maksimal 500 karakter." };
    notesPayload[n.slot] = content;
  }
  if (Object.keys(notesPayload).length > 5) {
    return { error: "Isi catatan tidak valid." };
  }

  if (input.assessmentId && !UUID_RE.test(input.assessmentId)) {
    return { error: "Data penilaian tidak valid." };
  }

  const dateResult = assessedDateToTz(input.assessedAt);
  if (typeof dateResult === "object" && dateResult !== null) return { error: dateResult.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_save_assessment", {
    p_student_id: input.studentId,
    p_material_id: input.materialId,
    p_pages_label: pages || null,
    p_status: input.status,
    p_score_value: input.scoreValue,
    p_score_label: input.scoreLabel || null,
    p_free_note: freeNote || null,
    p_notes: notesPayload,
    p_assessment_id: input.assessmentId ?? null,
    p_assessed_at: dateResult,
  });

  if (error) return { error: friendlyError(error.message) };

  invalidateTartilAssessments([input.studentId]);
  return { success: "Penilaian Tartil berhasil disimpan." };
}

/**
 * V73 — penilaian guru pada SATU HARI WIB (lewat RPC; teacher dari session).
 * Tax dipakai form jurnal & massal: saat guru memilih santri/tanggal, entri
 * yang sudah tersimpan langsung muncul — terlihat santri sudah dinilai hari itu.
 */
export type TartilOnDateEntry = {
  studentId: string;
  materialId: string;
  pagesLabel: string | null;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreValue: number | null;
  scoreLabel: string | null;
  freeNote: string | null;
  assessmentId: string;
};

export async function getTartilOnDateEntriesAction(
  date: string
): Promise<{ entries: TartilOnDateEntry[]; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { entries: [] };
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") {
    return { entries: [], error: "Sesi Anda telah berakhir. Silakan login kembali." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_assessments_on_date", {
    p_date: date,
  });
  if (error) {
    console.error("tartil_assessments_on_date failed:", error.message);
    // V76 — jangan diam-diam kosong: kabari guru agar tidak mengira semua "belum dinilai".
    const missing = /could not find the function|does not exist|schema cache/i.test(error.message);
    return {
      entries: [],
      error: missing
        ? "Fitur cek nilai per tanggal belum aktif di database (migrasi V76 belum dijalankan)."
        : `Gagal memuat nilai pada tanggal ini: ${friendlyError(error.message)}`,
    };
  }
  return {
    entries: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      studentId: r.student_id as string,
      materialId: r.material_id as string,
      pagesLabel: (r.pages_label as string | null) ?? null,
      status: r.status as TartilOnDateEntry["status"],
      scoreValue: (r.score_value as number | null) ?? null,
      scoreLabel: (r.score_label as string | null) ?? null,
      freeNote: (r.free_note as string | null) ?? null,
      assessmentId: r.assessment_id as string,
    })),
  };
}

/**
 * V67 — INPUT NILAI MASSAL: guru memasukkan penilaian Tartil untuk BANYAK
 * santri sekaligus (mis. lembaga baru yang datanya masih di kertas). Satu
 * panggilan → satu transaksi: gagal di satu item = tidak ada yang tersimpan.
 * Semua aturan (binaan, materi aktif, mode/grade lembaga) ditegakkan ulang oleh
 * RPC per item — client tidak pernah dipercaya.
 */
/**
 * V68 — input massal kini menerima `assessedAt` opsional (YYYY-MM-DD): saat
 * guru memindahkan catatan kertas lama, tanggal penilaian mengikuti kertas —
 * bukan hari input. Kosong → pakai waktu sekarang (perilaku lama).
 */
export type TartilBulkItem = {
  studentId: string;
  materialId: string;
  pagesLabel: string;
  status: string;
  scoreValue: number | null;
  scoreLabel: string;
  /** V74 — baris prefilled: set = UPDATE penilaian yang ada, bukan duplikat. */
  assessmentId?: string | null;
};

export async function saveTartilAssessmentsBulkAction(
  items: TartilBulkItem[],
  assessedAt?: string | null
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return { error: "Daftar penilaian tidak valid." };
  }

  const dateResult = assessedDateToTz(assessedAt);
  if (typeof dateResult === "object" && dateResult !== null) return { error: dateResult.error };

  const payload = items.map((it) => {
    const pages = (it.pagesLabel ?? "").trim();
    return {
      student_id: it.studentId,
      material_id: it.materialId,
      pages_label: pages || null,
      status: it.status,
      score_value: it.scoreValue,
      score_label: it.scoreLabel || null,
      free_note: null,
      assessment_id: it.assessmentId ?? null,
    };
  });

  for (const p of payload) {
    if (!UUID_RE.test(p.student_id) || !UUID_RE.test(p.material_id)) {
      return { error: "Data penilaian tidak valid." };
    }
    if (p.assessment_id !== null && !UUID_RE.test(p.assessment_id)) {
      return { error: "Data penilaian tidak valid." };
    }
    if (!["BELUM", "DIPELAJARI", "DINILAI"].includes(p.status)) {
      return { error: "Status penilaian tidak valid." };
    }
    if ((p.pages_label ?? "").length > 60) {
      return { error: "Halaman/bagian maksimal 60 karakter." };
    }
    if (p.status === "DINILAI" && p.score_value !== null) {
      if (!Number.isInteger(p.score_value) || p.score_value < 1 || p.score_value > 100) {
        return { error: "Nilai harus angka 1-100." };
      }
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("tartil_save_assessments_bulk", {
    p_items: payload,
    p_assessed_at: dateResult,
  });
  if (error) return { error: friendlyError(error.message) };

  invalidateTartilAssessments([...new Set(items.map((i) => i.studentId))]);
  revalidatePath("/ustadz/tartil");
  return { success: `${items.length} penilaian berhasil disimpan sekaligus.` };
}

/**
 * V12.14 — generate baris materi (jilid) untuk satu metode baca.
 * "Ummi" dengan 8 jilid → "Ummi Jilid 1".."Ummi Jilid 8" (yang belum ada).
 */
export async function generateTartilJilidsAction(methodId: string): Promise<ActionResult & { created?: number }> {
  const profile = await getSessionProfile();
  if (!profile || !UUID_RE.test(methodId)) {
    return { error: "Sesi tidak valid." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tartil_method_generate_jilids", { p_method_id: methodId });
  if (error) return { error: friendlyError(error.message) };
  return { success: "Jilid siap dipakai.", created: Number(data ?? 0) };
}

/** V12.14 — daftar template catatan untuk tombol "+ Tambah Template" di form guru. */
export async function saveTartilTemplateAction(input: {
  id?: string | null;
  slot: string;
  content: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Sesi tidak valid." };
  const content = input.content.trim();
  if (content.length < 1 || content.length > 300) {
    return { error: "Template 1-300 karakter." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("tartil_note_template_save", {
    p_id: input.id ?? null,
    p_slot: input.slot,
    p_content: content,
    p_is_active: input.isActive ?? true,
  });
  if (error) return { error: friendlyError(error.message) };
  return { success: "Template catatan disimpan." };
}

export async function deleteTartilTemplateAction(id: string): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || !UUID_RE.test(id)) return { error: "Sesi tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tartil_note_template_delete", { p_id: id });
  if (error) return { error: friendlyError(error.message) };
  return { success: "Template dihapus." };
}

/** Soft delete (rule #40) — history & Kartu Prestasi stay consistent. */
export async function deleteTartilAssessmentAction(assessmentId: string): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!UUID_RE.test(assessmentId)) return { error: "Penilaian tidak valid." };

  const supabase = await createClient();

  // Need the student id for cache invalidation.
  const { data: row } = await supabase
    .from("tartil_assessments")
    .select("student_id")
    .eq("id", assessmentId)
    .maybeSingle();

  const { error } = await supabase.rpc("tartil_soft_delete_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) return { error: friendlyError(error.message) };

  if (row?.student_id) invalidateTartilAssessments([row.student_id as string]);
  return { success: "Penilaian dihapus." };
}
