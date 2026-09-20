"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateLearningAssessments } from "@/lib/cache";
import { revalidatePath } from "next/cache";
import type { LearningModule } from "@/lib/learning-shared";

/**
 * TAHFIZH V12.8 — Grid penilaian Hadits & Doa Harian.
 *
 * Menu Hadits/Doa memuat grid langsung (pola menu Tahfidz V12.6):
 * header kolom = materi lembaga, baris kiri = nama santri, sel = nilai.
 * Data dari RPC SECURITY DEFINER `learning_grid` (verifikasi session → role →
 * tenant → binaan halaqah di dalam RPC). Simpan massal lewat RPC
 * `learning_save_grid` — tiap perubahan = riwayat baru (bukan overwrite).
 */

export type LearningGridCellInput = {
  materialId: string;
  studentId: string;
  mode: "CENTANG" | "HURUF" | "ANGKA";
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreLabel: string | null;
  scoreValue: number | null;
};

export type LearningGridSaveResult = { error?: string; saved?: number };

export async function fetchLearningGridAction(module: LearningModule): Promise<{
  error?: string;
  materials?: { materialId: string; title: string; sortOrder: number }[];
  students?: { id: string; name: string; nickname: string | null }[];
  grades?: string[];
  cells?: Record<
    string,
    { status: string; scoreLabel: string | null; scoreValue: number | null }
  >;
}> {
  const profile = await getSessionProfile();
  if (
    !profile ||
    !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) ||
    !profile.tenantId
  ) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (module !== "HADITS" && module !== "DOA") {
    return { error: "Modul pembelajaran tidak valid." };
  }

  const supabase = await createClient();
  const [res, gradesRes] = await Promise.all([
    supabase.rpc("learning_grid", { p_module: module }),
    supabase
      .from("tahfidz_grade_settings")
      .select("label")
      .eq("tenant_id", profile.tenantId)
      .order("sort_order"),
  ]);
  if (res.error || !res.data) {
    return { error: "Gagal memuat data grid pembelajaran." };
  }

  const grades: string[] = (gradesRes.data ?? []).map((g) => g.label);

  const data = res.data as {
    materials: { materialId: string; title: string; sortOrder: number }[];
    students: { id: string; name: string; nickname: string | null }[];
    cells: {
      materialId: string;
      studentId: string;
      status: string;
      scoreLabel: string | null;
      scoreValue: number | null;
    }[];
  };

  const cells: Record<
    string,
    { status: string; scoreLabel: string | null; scoreValue: number | null }
  > = {};
  for (const c of data.cells ?? []) {
    cells[`${c.materialId}:${c.studentId}`] = {
      status: c.status,
      scoreLabel: c.scoreLabel,
      scoreValue: c.scoreValue,
    };
  }

  return { materials: data.materials ?? [], students: data.students ?? [], grades, cells };
}

export type LearningMaterialResult = { error?: string; id?: string };

/**
 * V12.10 — Tambah materi langsung dari menu Hadits/Doa (sistem sama dengan
 * Tugas/Tajwid): materi jadi kolom penilaian di grid. Validasi & tenant
 * diverifikasi di RPC SECURITY DEFINER `learning_material_create`.
 */
export async function createLearningMaterialAction(
  module: LearningModule,
  title: string
): Promise<LearningMaterialResult> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (module !== "HADITS" && module !== "DOA") {
    return { error: "Modul pembelajaran tidak valid." };
  }

  const clean = (title ?? "").trim();
  if (clean.length < 1 || clean.length > 160) {
    return { error: "Nama materi wajib diisi (maks. 160 karakter)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_material_create", {
    p_module: module,
    p_title: clean,
  });
  if (error) {
    const msg = error.message;
    if (msg.includes("JUDUL_TIDAK_VALID")) return { error: "Nama materi wajib diisi (maks. 160 karakter) dan belum dipakai." };
    if (msg.includes("MODUL_TIDAK_VALID")) return { error: "Modul pembelajaran tidak valid." };
    return { error: "Materi belum berhasil ditambahkan. Silakan coba lagi." };
  }

  invalidateLearningAssessments([], module);
  revalidatePath(`/ustadz/${module === "HADITS" ? "hadits" : "doa"}`);
  revalidatePath(`/koordinator/${module === "HADITS" ? "hadits" : "doa"}`);
  return { id: (data as string) ?? undefined };
}

/**
 * V12.10 — Hapus (nonaktifkan) materi langsung dari header kolom grid.
 * Riwayat penilaian lama tetap tersimpan (append-only).
 */
export async function deleteLearningMaterialAction(
  module: LearningModule,
  materialId: string
): Promise<{ error?: string }> {
  const profile = await getSessionProfile();
  if (!profile || !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) || !profile.tenantId) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (module !== "HADITS" && module !== "DOA") {
    return { error: "Modul pembelajaran tidak valid." };
  }
  if (!materialId) {
    return { error: "Materi tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("learning_material_delete", {
    p_module: module,
    p_material: materialId,
  });
  if (error) {
    if (error.message.includes("MATERI_TIDAK_DITEMUKAN")) return { error: "Materi tidak ditemukan." };
    return { error: "Materi belum berhasil dihapus. Silakan coba lagi." };
  }

  invalidateLearningAssessments([], module);
  revalidatePath(`/ustadz/${module === "HADITS" ? "hadits" : "doa"}`);
  revalidatePath(`/koordinator/${module === "HADITS" ? "hadits" : "doa"}`);
  return {};
}

export async function saveLearningGridAction(
  module: LearningModule,
  items: LearningGridCellInput[]
): Promise<LearningGridSaveResult> {
  const profile = await getSessionProfile();
  if (
    !profile ||
    !["USTADZ", "KOORDINATOR", "ADMIN"].includes(profile.role) ||
    !profile.tenantId
  ) {
    return { error: "Session Anda telah berakhir. Silakan login kembali." };
  }
  if (module !== "HADITS" && module !== "DOA") {
    return { error: "Modul pembelajaran tidak valid." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 2000) {
    return { error: "Daftar penilaian tidak valid." };
  }

  for (const it of items) {
    if (it.status === "DINILAI") {
      if (
        it.mode === "ANGKA" &&
        (it.scoreValue === null ||
          it.scoreValue < 1 ||
          it.scoreValue > 100 ||
          !Number.isInteger(it.scoreValue))
      ) {
        return { error: "Nilai angka harus bulat 1-100." };
      }
      if (it.mode === "HURUF" && !it.scoreLabel) {
        return { error: "Pilih grade huruf untuk penilaian yang dinilai." };
      }
    }
  }

  const supabase = await createClient();
  const payload = items.map((it) => ({
    materialId: it.materialId,
    studentId: it.studentId,
    mode: it.mode,
    status: it.status,
    scoreValue: it.mode === "ANGKA" ? it.scoreValue : null,
    scoreLabel: it.mode === "HURUF" ? it.scoreLabel : null,
  }));

  const { data, error } = await supabase.rpc("learning_save_grid", {
    p_module: module,
    p_items: payload,
  });
  if (error) {
    const msg = error.message;
    if (msg.includes("SANTRI_BUKAN_BINAAN"))
      return { error: "Ada santri yang bukan binaan Anda. Muat ulang halaman." };
    if (msg.includes("SANTRI_TIDAK_DITEMUKAN"))
      return { error: "Ada santri yang sudah tidak terdaftar. Muat ulang halaman." };
    if (msg.includes("MATERI_TIDAK_AKTIF"))
      return { error: "Ada materi yang sudah tidak aktif. Muat ulang halaman." };
    if (msg.includes("NILAI_ANGKA_TIDAK_VALID"))
      return { error: "Nilai angka harus 1-100." };
    if (msg.includes("GRADE_TIDAK_VALID"))
      return { error: "Grade huruf tidak valid untuk lembaga ini." };
    if (msg.includes("STATUS_TIDAK_VALID"))
      return { error: "Status penilaian tidak valid." };
    return { error: "Penilaian belum berhasil disimpan. Silakan coba lagi." };
  }

  const studentIds = [...new Set(items.map((i) => i.studentId))];
  invalidateLearningAssessments(studentIds, module);
  return { saved: (data as number) ?? items.length };
}
