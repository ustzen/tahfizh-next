"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * TAHFIZH V12.8 — Tugas Halaqah (grid penilaian per tugas).
 *
 * Guru memberikan tugas untuk SEMUA santri di halaqah yang diampu. Grid:
 * baris = santri, kolom = tugas, sel = nilai dengan 3 mode (Centang/Huruf/
 * Angka) yang bisa diganti guru kapan saja. Semua verifikasi (session, role,
 * tenant, halaqah yang diampu) dilakukan di RPC SECURITY DEFINER.
 */

export type TugasMode = "CENTANG" | "HURUF" | "ANGKA";

export type TugasHalaqah = { id: string; name: string };

export type TugasItem = {
  id: string;
  title: string;
  description: string | null;
  halaqahId: string;
  halaqahName: string;
  assignedDate: string;
  dueDate: string;
};

export type TugasScore = {
  tugasId: string;
  studentId: string;
  mode: TugasMode;
  scoreValue: number | null;
  scoreLabel: string | null;
  note: string | null;
};

export type TugasGridData = {
  error?: string;
  halaqah?: TugasHalaqah[];
  tasks?: TugasItem[];
  students?: { id: string; name: string; nickname: string | null; code?: string | null }[];
  scores?: Record<string, TugasScore>;
};

export async function fetchTugasGridAction(): Promise<TugasGridData> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const supabase = await createClient();
  const res = await supabase.rpc("tugas_halaqah_grid");
  if (res.error || !res.data) {
    return { error: "Gagal memuat data tugas." };
  }

  const data = res.data as {
    halaqah: TugasHalaqah[];
    tasks: TugasItem[];
    students: { id: string; name: string; nickname: string | null; code?: string | null }[];
    scores: { tugasId: string; studentId: string; mode: string; scoreValue: number | null; scoreLabel: string | null; note: string | null }[];
  };

  const scores: Record<string, TugasScore> = {};
  for (const s of data.scores ?? []) {
    scores[`${s.tugasId}:${s.studentId}`] = {
      tugasId: s.tugasId,
      studentId: s.studentId,
      mode: (s.mode as TugasMode) ?? "CENTANG",
      scoreValue: s.scoreValue,
      scoreLabel: s.scoreLabel,
      note: s.note,
    };
  }

  return {
    halaqah: data.halaqah ?? [],
    tasks: data.tasks ?? [],
    students: data.students ?? [],
    scores,
  };
}

export type TugasSaveResult = { error?: string; saved?: number };

export async function saveTugasGridAction(
  items: { tugasId: string; studentId: string; mode: TugasMode; scoreLabel: string | null; scoreValue: number | null }[]
): Promise<TugasSaveResult> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 2000) {
    return { error: "Daftar nilai tidak valid." };
  }

  for (const it of items) {
    if (it.mode === "ANGKA" && (it.scoreValue === null || it.scoreValue < 1 || it.scoreValue > 100 || !Number.isInteger(it.scoreValue))) {
      return { error: "Nilai angka harus bulat 1-100." };
    }
    if (it.mode === "HURUF" && !it.scoreLabel) {
      return { error: "Pilih grade huruf untuk sel yang dinilai." };
    }
  }

  const supabase = await createClient();
  const payload = items.map((it) => ({
    tugasId: it.tugasId,
    studentId: it.studentId,
    mode: it.mode,
    scoreValue: it.mode === "ANGKA" ? it.scoreValue : null,
    scoreLabel: it.mode === "HURUF" ? it.scoreLabel : "✓",
    note: null,
  }));

  const { data, error } = await supabase.rpc("tugas_halaqah_save", { p_items: payload });
  if (error) {
    const msg = error.message;
    if (msg.includes("TUGAS_TIDAK_DITEMUKAN")) return { error: "Ada tugas yang sudah tidak tersedia. Muat ulang halaman." };
    if (msg.includes("SANTRI_TIDAK_VALID")) return { error: "Ada santri yang tidak valid. Muat ulang halaman." };
    if (msg.includes("NILAI_ANGKA_TIDAK_VALID")) return { error: "Nilai angka harus 1-100." };
    if (msg.includes("GRADE_TIDAK_VALID")) return { error: "Grade huruf tidak valid untuk lembaga ini." };
    if (msg.includes("MODE_TIDAK_VALID")) return { error: "Mode penilaian tidak valid." };
    return { error: "Nilai belum berhasil disimpan. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tugas");
  return { saved: (data as number) ?? items.length };
}

export type TugasCreateResult = { error?: string; id?: string };

export async function createTugasAction(input: {
  title: string;
  halaqahId: string;
  dueDate: string;
  assignedDate?: string;
  description?: string | null;
}): Promise<TugasCreateResult> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const title = (input.title ?? "").trim();
  if (title.length < 1 || title.length > 120) {
    return { error: "Judul tugas wajib diisi (maks. 120 karakter)." };
  }
  if (!input.halaqahId) {
    return { error: "Pilih halaqah terlebih dahulu." };
  }
  if (!input.dueDate) {
    return { error: "Tentukan tenggat waktu tugas." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tugas_halaqah_create", {
    p_title: title,
    p_halaqah_id: input.halaqahId,
    p_due_date: input.dueDate,
    p_assigned: input.assignedDate || new Date().toISOString().slice(0, 10),
    p_description: input.description?.trim() || null,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("HALAQAH_TIDAK_VALID")) return { error: "Halaqah tidak valid atau bukan binaan Anda." };
    if (msg.includes("TANGGAL_TIDAK_VALID")) return { error: "Tanggal tidak valid — tenggat tidak boleh sebelum tanggal pemberian." };
    if (msg.includes("JUDUL_TIDAK_VALID")) return { error: "Judul tugas wajib diisi (maks. 120 karakter)." };
    return { error: "Tugas belum berhasil dibuat. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tugas");
  return { id: (data as string) ?? undefined };
}

export async function deleteTugasAction(tugasId: string): Promise<{ error?: string }> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!tugasId) {
    return { error: "Tugas tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("tugas_halaqah_delete", { p_tugas: tugasId });
  if (error) {
    if (error.message.includes("TUGAS_TIDAK_DITEMUKAN")) return { error: "Tugas tidak ditemukan." };
    return { error: "Tugas belum berhasil dihapus. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tugas");
  return {};
}
