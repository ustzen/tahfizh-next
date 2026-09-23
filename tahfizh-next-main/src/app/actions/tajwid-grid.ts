"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * TAHFIZH V12.9 — Tajwid Materi (grid penilaian per materi).
 *
 * Sistem sama dengan menu Tugas: guru menambahkan materi tajwid (Mad,
 * Dengung, Iqlab, …), lalu menilai penguasaan tiap santri di grid — 3 mode
 * pilihan (Centang/Huruf/Angka) yang bisa diganti kapan saja. Semua
 * verifikasi (session, role, tenant, binaan halaqah) di RPC SECURITY DEFINER.
 */

export type TajwidMode = "CENTANG" | "HURUF" | "ANGKA";

export type TajwidMateri = {
  id: string;
  title: string;
  description: string | null;
};

export type TajwidScore = {
  materiId: string;
  studentId: string;
  mode: TajwidMode;
  scoreValue: number | null;
  scoreLabel: string | null;
};

export type TajwidGridData = {
  error?: string;
  materi?: TajwidMateri[];
  students?: { id: string; name: string; nickname: string | null; code?: string | null }[];
  scores?: Record<string, TajwidScore>;
};

export async function fetchTajwidGridAction(): Promise<TajwidGridData> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const supabase = await createClient();
  const res = await supabase.rpc("tajwid_materi_grid");
  if (res.error || !res.data) {
    return { error: "Gagal memuat data tajwid." };
  }

  const data = res.data as {
    materi: TajwidMateri[];
    students: { id: string; name: string; nickname: string | null; code?: string | null }[];
    scores: { materiId: string; studentId: string; mode: string; scoreValue: number | null; scoreLabel: string | null }[];
  };

  const scores: Record<string, TajwidScore> = {};
  for (const s of data.scores ?? []) {
    scores[`${s.materiId}:${s.studentId}`] = {
      materiId: s.materiId,
      studentId: s.studentId,
      mode: (s.mode as TajwidMode) ?? "CENTANG",
      scoreValue: s.scoreValue,
      scoreLabel: s.scoreLabel,
    };
  }

  return {
    materi: data.materi ?? [],
    students: data.students ?? [],
    scores,
  };
}

export type TajwidSaveResult = { error?: string; saved?: number };

export async function saveTajwidGridAction(
  items: { materiId: string; studentId: string; mode: TajwidMode; scoreLabel: string | null; scoreValue: number | null }[]
): Promise<TajwidSaveResult> {
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
    materiId: it.materiId,
    studentId: it.studentId,
    mode: it.mode,
    scoreValue: it.mode === "ANGKA" ? it.scoreValue : null,
    scoreLabel: it.mode === "HURUF" ? it.scoreLabel : "✓",
  }));

  const { data, error } = await supabase.rpc("tajwid_materi_save", { p_items: payload });
  if (error) {
    const msg = error.message;
    if (msg.includes("MATERI_TIDAK_DITEMUKAN")) return { error: "Ada materi yang sudah tidak tersedia. Muat ulang halaman." };
    if (msg.includes("SANTRI_TIDAK_VALID")) return { error: "Ada santri yang tidak valid / bukan binaan Anda. Muat ulang halaman." };
    if (msg.includes("NILAI_ANGKA_TIDAK_VALID")) return { error: "Nilai angka harus 1-100." };
    if (msg.includes("GRADE_TIDAK_VALID")) return { error: "Grade huruf tidak valid untuk lembaga ini." };
    if (msg.includes("MODE_TIDAK_VALID")) return { error: "Mode penilaian tidak valid." };
    return { error: "Nilai belum berhasil disimpan. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tajwid");
  return { saved: (data as number) ?? items.length };
}

export type TajwidCreateResult = { error?: string; id?: string };

export async function createTajwidMateriAction(input: {
  title: string;
  description?: string | null;
}): Promise<TajwidCreateResult> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const title = (input.title ?? "").trim();
  if (title.length < 1 || title.length > 120) {
    return { error: "Nama materi wajib diisi (maks. 120 karakter)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tajwid_materi_create", {
    p_title: title,
    p_description: input.description?.trim() || null,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("JUDUL_TIDAK_VALID")) return { error: "Nama materi wajib diisi (maks. 120 karakter)." };
    if (msg.includes("DESKRIPSI_TERLALU_PANJANG")) return { error: "Deskripsi maksimal 500 karakter." };
    return { error: "Materi belum berhasil dibuat. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tajwid");
  return { id: (data as string) ?? undefined };
}

export async function deleteTajwidMateriAction(materiId: string): Promise<{ error?: string }> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!materiId) {
    return { error: "Materi tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("tajwid_materi_delete", { p_materi: materiId });
  if (error) {
    if (error.message.includes("MATERI_TIDAK_DITEMUKAN")) return { error: "Materi tidak ditemukan." };
    return { error: "Materi belum berhasil dihapus. Silakan coba lagi." };
  }

  revalidatePath("/ustadz/tajwid");
  return {};
}
