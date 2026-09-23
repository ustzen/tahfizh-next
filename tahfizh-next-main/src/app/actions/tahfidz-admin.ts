"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { CACHE_KEYS, invalidateTahfidzConfig, invalidateTags } from "@/lib/cache";
import type { ActionResult } from "@/app/actions/crud";

/**
 * TAHFIZH V3 — ADMIN Tahfidz configuration (server actions).
 * Role is re-read from the server session on every call; the client never
 * sends tenant_id, mode, or grade payloads that are trusted as-is (rule #35).
 * Rules #6-#20, #48-#50.
 */

const VALID_MODES = ["CENTANG", "HURUF", "ANGKA"] as const;

type SurahRow = {
  id: string;
  tenant_id: string;
  surah_id: string | null;
  name_override: string | null;
  sort_order: number;
  is_active: boolean;
};

function friendlyDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23503" && error.message.includes("tahfidz_assessments")) {
    return "Surat ini sudah digunakan dalam penilaian. Gunakan Nonaktifkan, bukan hapus.";
  }
  if (error.code === "23505") return "Data sudah ada (duplikat).";
  return fallback;
}

/* ------------------------------------------------------------------------ */
/* MASTER SURAT — list sources                                              */
/* ------------------------------------------------------------------------ */

async function loadTenantSurahs(): Promise<{ surahs: SurahRow[]; error?: string }> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { surahs: [], error: "Akses ditolak." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tahfidz_tenant_surahs")
    .select("id, tenant_id, surah_id, name_override, sort_order, is_active")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order");
  if (error) return { surahs: [], error: "Gagal memuat master surat." };
  return { surahs: data as SurahRow[] };
}

/** Add a surah from the GLOBAL master to this tenant (rule #6/#32). */
export async function addTenantSurahAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };

  const surahId = String(formData.get("surahId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(surahId)) return { error: "Surat tidak valid." };

  const supabase = await createClient();

  // Resolve next sort_order within the tenant (append at the end).
  const { data: last } = await supabase
    .from("tahfidz_tenant_surahs")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("tahfidz_tenant_surahs").insert({
    tenant_id: profile.tenantId,
    surah_id: surahId,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) {
    return { error: friendlyDbError(error, "Surat sudah ada di lembaga Anda atau gagal ditambahkan.") };
  }

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Surat ditambahkan." };
}

/** Add a tenant-CUSTOM surah (rule #33). */
export async function addCustomSurahAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 60) return { error: "Nama surat harus 1-60 karakter." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tahfidz_tenant_surahs")
    .select("sort_order")
    .eq("tenant_id", profile.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("tahfidz_tenant_surahs").insert({
    tenant_id: profile.tenantId,
    surah_id: null,
    name_override: name,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) return { error: "Gagal menambahkan surat custom." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: `Surat \"${name}\" ditambahkan.` };
}

/** Rename display name (override only — history stays intact, rule #10). */
export async function renameTenantSurahAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { error: "Surat tidak valid." };
  if (name.length < 1 || name.length > 60) return { error: "Nama surat harus 1-60 karakter." };

  const { surahs, error: loadErr } = await loadTenantSurahs();
  if (loadErr) return { error: loadErr };
  const row = surahs.find((s) => s.id === id);
  if (!row) return { error: "Surat tidak ditemukan." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tahfidz_tenant_surahs")
    .update({ name_override: name })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId!);
  if (error) return { error: "Gagal mengubah nama surat." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Nama surat diperbarui." };
}

/** Reset an override back to the master name. */
export async function resetSurahNameAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Surat tidak valid." };

  const { surahs, error: loadErr } = await loadTenantSurahs();
  if (loadErr) return { error: loadErr };
  const row = surahs.find((s) => s.id === id);
  if (!row) return { error: "Surat tidak ditemukan." };
  if (!row.surah_id) return { error: "Surat custom tidak memiliki nama master." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tahfidz_tenant_surahs")
    .update({ name_override: null })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId!);
  if (error) return { error: "Gagal mengembalikan nama surat." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Nama surat kembali ke nama master." };
}

/** Activate / deactivate (rule #9 — the safe path for used surahs). */
export async function setSurahActiveAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!id) return { error: "Surat tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tahfidz_tenant_surahs")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId!);
  if (error) return { error: "Gagal mengubah status surat." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: isActive ? "Surat diaktifkan." : "Surat dinonaktifkan." };
}

/** Delete ONLY if unused (FK + explicit check; rule #9). */
export async function deleteTenantSurahAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN") return { error: "Akses ditolak." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Surat tidak valid." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("tahfidz_assessments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_surah_id", id)
    .eq("tenant_id", profile.tenantId!);

  if ((count ?? 0) > 0) {
    return {
      error:
        "Surat ini sudah memiliki data penilaian. Tidak dapat dihapus — gunakan Nonaktifkan agar histori tetap utuh.",
    };
  }

  const { error } = await supabase
    .from("tahfidz_tenant_surahs")
    .delete()
    .eq("id", id)
    .eq("tenant_id", profile.tenantId!);
  if (error) return { error: "Gagal menghapus surat." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Surat dihapus." };
}

/** Persist a new drag-and-drop order (rule #11). */
export async function reorderTenantSurahsAction(orderIds: string[]): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };
  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 200) {
    return { error: "Urutan tidak valid." };
  }

  const supabase = await createClient();

  // Verify every id belongs to this tenant BEFORE writing anything.
  const { data: owned, error: loadErr } = await supabase
    .from("tahfidz_tenant_surahs")
    .select("id")
    .eq("tenant_id", profile.tenantId);
  if (loadErr) return { error: "Gagal memuat surat." };
  const ownedSet = new Set((owned ?? []).map((r) => r.id));
  if (!orderIds.every((id) => ownedSet.has(id))) return { error: "Urutan tidak valid." };

  const updates = orderIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
  const { error } = await supabase.from("tahfidz_tenant_surahs").upsert(updates, {
    onConflict: "id",
  });
  if (error) return { error: "Gagal menyimpan urutan." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Urutan surat tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* MODE + GRADES (rules #12-#15)                                            */
/* ------------------------------------------------------------------------ */

export async function saveGradesAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };

  const labels = formData.getAll("gradeLabel").map((v) => String(v).trim());
  const mins = formData.getAll("gradeMin").map((v) => Number(v));
  const maxs = formData.getAll("gradeMax").map((v) => Number(v));

  if (labels.length === 0 || labels.length > 15) return { error: "Isi minimal satu grade." };

  const rows: { tenant_id: string; label: string; min_value: number; max_value: number; sort_order: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (!label) continue;
    if (label.length > 10) return { error: `Label grade \"${label}\" terlalu panjang (maks 10).` };
    if (seen.has(label)) return { error: `Grade \"${label}\" duplikat.` };
    seen.add(label);
    const min = mins[i];
    const max = maxs[i];
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100 || min > max) {
      return { error: `Rentang nilai untuk \"${label}\" tidak valid (1-100, min ≤ maks).` };
    }
    rows.push({ tenant_id: profile.tenantId, label, min_value: min, max_value: max, sort_order: i });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tahfidz_grade_settings").upsert(rows, {
    onConflict: "tenant_id,label",
  });
  if (error) return { error: "Gagal menyimpan konfigurasi grade." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: "Konfigurasi grade tersimpan." };
}

/**
 * Convert-then-switch mode. The RPC is transactional (ALL-OR-NOTHING, rule #50)
 * and refuses to run if any existing score lacks a mapping (rule #49).
 */
export async function convertModeAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };

  const toMode = String(formData.get("toMode") ?? "");
  const method = String(formData.get("method") ?? "NONE");
  if (!(VALID_MODES as readonly string[]).includes(toMode)) return { error: "Mode tidak valid." };

  // Mapping JSON built client-side from the conversion dialog.
  let mapping: Record<string, unknown> = {};
  const rawMapping = String(formData.get("mapping") ?? "{}");
  try {
    mapping = JSON.parse(rawMapping) as Record<string, unknown>;
  } catch {
    return { error: "Konfigurasi konversi tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tahfidz_convert_grades", {
    p_to_mode: toMode,
    p_method: method,
    p_mapping: mapping,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("KONVERSI_BELUM_LENGKAP")) {
      const missing = msg.split(":")[1] ?? "?";
      return { error: `Konversi belum lengkap untuk nilai \"${missing}\". Tentukan nilai konversinya terlebih dahulu.` };
    }
    if (msg.includes("MODE_SAMA")) return { error: "Mode yang dipilih sama dengan mode saat ini." };
    return { error: "Konversi gagal. Tidak ada data yang diubah." };
  }

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: `Mode penilaian diubah menjadi ${toMode}. ${(data as number) ?? 0} penilaian dikonversi.` };
}

/** First-time mode selection (no data yet → no conversion needed). */
export async function setModeAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) return { error: "Akses ditolak." };

  const toMode = String(formData.get("mode") ?? "");
  if (!(VALID_MODES as readonly string[]).includes(toMode)) return { error: "Mode tidak valid." };

  const supabase = await createClient();

  // Safety net: if scored data exists, refuse — use convertModeAction instead.
  const { count } = await supabase
    .from("tahfidz_assessments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenantId)
    .eq("status", "DINILAI");
  if ((count ?? 0) > 0) {
    return { error: "Sudah ada data penilaian. Gunakan alur Konversi Nilai untuk mengubah mode." };
  }

  const { error } = await supabase
    .from("tahfidz_settings")
    .upsert({ tenant_id: profile.tenantId, mode: toMode }, { onConflict: "tenant_id" });
  if (error) return { error: "Gagal menyimpan mode penilaian." };

  invalidateTahfidzConfig(profile.tenantCode);
  return { success: `Mode penilaian diatur ke ${toMode}.` };
}

/** Global master surah list for the admin catalog picker (rule #6/#32). */
export async function loadGlobalSurahsAction(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tahfidz_surahs")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

/** Used by the conversion dialog to read current mode + grades. */
export async function loadTahfidzConfigAction(): Promise<
  { mode: string; grades: { label: string; minValue: number; maxValue: number }[]; error?: string }
> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { mode: "CENTANG", grades: [], error: "Akses ditolak." };
  }
  const supabase = await createClient();
  const [{ data: settings }, { data: grades }] = await Promise.all([
    supabase.from("tahfidz_settings").select("mode").eq("tenant_id", profile.tenantId).maybeSingle(),
    supabase
      .from("tahfidz_grade_settings")
      .select("label, min_value, max_value")
      .eq("tenant_id", profile.tenantId)
      .order("sort_order"),
  ]);
  return {
    mode: (settings?.mode as string) ?? "CENTANG",
    grades: (grades ?? []).map((g) => ({ label: g.label, minValue: g.min_value, maxValue: g.max_value })),
  };
}
