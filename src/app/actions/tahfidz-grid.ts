"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateTahfidzAssessments } from "@/lib/cache";

/**
 * TAHFIZH V12.6 — Grid penilaian tahfidz guru.
 *
 * Menu Tahfidz guru langsung memuat grid: baris = surat aktif lembaga
 * (An-Nas → An-Naba'), kolom = santri binaan. Satu tombol Simpan memproses
 * seluruh perubahan lewat RPC `tahfidz_save_grid` (verifikasi session → role →
 * tenant → guru → binaan → surat aktif → validasi nilai per mode di server).
 */

export type GridCellInput = {
  surahId: string;
  studentId: string;
  mode: "CENTANG" | "HURUF" | "ANGKA";
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreLabel: string | null;
  scoreValue: number | null;
  note?: string | null;
};

export type GridSaveResult = { error?: string; saved?: number };

export async function fetchTahfidzGridAction(): Promise<{
  error?: string;
  students?: { id: string; name: string; nickname: string | null; code?: string | null }[];
  rows?: { surahId: string; name: string; sortOrder: number }[];
  grades?: string[];
  cells?: Record<string, { status: string; scoreLabel: string | null; scoreValue: number | null }>;
}> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }

  const supabase = await createClient();
  const [gridRes, gradesRes] = await Promise.all([
    supabase.rpc("tahfidz_surahs_grid"),
    supabase
      .from("tahfidz_grade_settings")
      .select("label")
      .eq("tenant_id", profile.tenantId)
      .order("sort_order"),
  ]);

  if (gridRes.error || !gridRes.data) {
    return { error: "Gagal memuat data grid tahfidz." };
  }

  const grades: string[] = (gradesRes.data ?? []).map((g) => g.label);
  const data = gridRes.data as { students: { id: string; name: string; nickname: string | null; code?: string | null }[]; rows: { surahId: string; name: string; sortOrder: number }[] };

  // Nilai tersimpan per (surat, santri) — hanya binaan guru (SECURITY DEFINER
  // memverifikasi relasi halaqah di dalam RPC).
  const cellsRes = await supabase.rpc("tahfidz_grid_cells");
  if (cellsRes.error || !cellsRes.data) {
    return {
      students: data.students,
      rows: data.rows,
      cells: {},
    };
  }
  const cells: Record<string, { status: string; scoreLabel: string | null; scoreValue: number | null }> = {};
  for (const c of cellsRes.data as { surahId: string; studentId: string; status: string; scoreLabel: string | null; scoreValue: number | null }[]) {
    cells[`${c.surahId}:${c.studentId}`] = {
      status: c.status,
      scoreLabel: c.scoreLabel,
      scoreValue: c.scoreValue,
    };
  }

  return { students: data.students, rows: data.rows, grades, cells };
}

export async function saveTahfidzGridAction(items: GridCellInput[]): Promise<GridSaveResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 2000) {
    return { error: "Daftar penilaian tidak valid." };
  }

  for (const it of items) {
    if (it.status === "DINILAI") {
      if (it.mode === "ANGKA" && (it.scoreValue === null || it.scoreValue < 1 || it.scoreValue > 100 || !Number.isInteger(it.scoreValue))) {
        return { error: `Nilai angka harus bulat 1-100 (surat terpilih).` };
      }
      if (it.mode === "HURUF" && !it.scoreLabel) {
        return { error: "Pilih grade huruf untuk penilaian yang dinilai." };
      }
    }
  }

  const supabase = await createClient();
  const payload = items.map((it) => ({
    studentId: it.studentId,
    surahId: it.surahId,
    mode: it.mode,
    status: it.status,
    scoreValue: it.mode === "ANGKA" ? it.scoreValue : null,
    scoreLabel: it.mode === "HURUF" ? it.scoreLabel : null,
    note: it.note ?? null,
  }));

  const { data, error } = await supabase.rpc("tahfidz_save_grid", { p_items: payload });
  if (error) {
    const msg = error.message;
    if (msg.includes("SANTRI_BUKAN_BINAAN")) return { error: "Ada santri yang bukan binaan Anda. Muat ulang halaman." };
    if (msg.includes("SURAT_TIDAK_AKTIF")) return { error: "Ada surat yang sudah tidak aktif. Muat ulang halaman." };
    if (msg.includes("NILAI_ANGKA_TIDAK_VALID")) return { error: "Nilai angka harus 1-100." };
    if (msg.includes("GRADE_TIDAK_VALID")) return { error: "Grade huruf tidak valid untuk lembaga ini." };
    if (msg.includes("STATUS_TIDAK_VALID")) return { error: "Status penilaian tidak valid." };
    if (msg.includes("GURU_TIDAK_DITEMUKAN")) return { error: "Profil guru Anda belum tertaut ke akun ini. Hubungi admin lembaga untuk menautkan akun." };
    if (msg.includes("AKSES_DITOLAK")) return { error: "Session Anda telah berakhir. Silakan login kembali." };
    return { error: "Penilaian belum berhasil disimpan. Silakan coba lagi." };
  }

  const studentIds = [...new Set(items.map((i) => i.studentId))];
  invalidateTahfidzAssessments(studentIds);
  return { saved: (data as number) ?? items.length };
}
