import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * TAHFIZH V58 — Modul lembaga kustom (SERVER ONLY).
 *
 * Lembaga bisa menambah modul sendiri (mis. "Kaligrafi"); guru mencatat poin
 * kemajuan santri, dan dasbor santri menampilkan tile modul dengan progres
 * jumlah poin vs target poin modul.
 */

export type CustomModuleItem = {
  id: string;
  label: string;
  icon: string;
  tone: string;
  poinTarget: number;
  sortOrder: number;
  isActive: boolean;
};

export type CustomModuleCount = {
  moduleId: string;
  studentId: string;
  cnt: number;
};

export type CustomModuleLog = {
  id: string;
  moduleId: string;
  moduleLabel: string;
  studentId: string;
  studentName: string;
  logDate: string;
  note: string | null;
};

type Row = Record<string, unknown>;

export const getCustomModules = cache(async (all = false): Promise<CustomModuleItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("custom_module_list", { p_all: all });
  if (error) {
    console.error("[custom_module_list]", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id ?? ""),
    label: String(r.label ?? ""),
    icon: String(r.icon ?? "star"),
    tone: String(r.tone ?? "emerald"),
    poinTarget: Number(r.poin_target ?? 0),
    sortOrder: Number(r.sort_order ?? 100),
    isActive: r.is_active !== false,
  }));
});

/** Jumlah poin per modul per anak milik akun wali ini (untuk dasbor santri). */
export const getCustomModuleCounts = cache(async (): Promise<CustomModuleCount[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("custom_module_counts");
  if (error) {
    console.error("[custom_module_counts]", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    moduleId: String(r.module_id ?? ""),
    studentId: String(r.student_id ?? ""),
    cnt: Number(r.cnt ?? 0),
  }));
});

/** Riwayat catatan poin terbaru untuk guru/admin/koordinator. */
export const getCustomModuleLogPage = cache(async (limit = 50): Promise<CustomModuleLog[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("custom_module_log_page", { p_limit: limit });
  if (error) {
    console.error("[custom_module_log_page]", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id ?? ""),
    moduleId: String(r.module_id ?? ""),
    moduleLabel: String(r.module_label ?? ""),
    studentId: String(r.student_id ?? ""),
    studentName: String(r.student_name ?? ""),
    logDate: String(r.log_date ?? ""),
    note: (r.note as string | null) ?? null,
  }));
});
