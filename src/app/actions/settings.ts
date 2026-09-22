"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { invalidateTenantConfig, CACHE_KEYS, invalidateTags } from "@/lib/cache";
import { slugifyIdentity, parseIdentityTypes } from "@/lib/identity";
import { TERMINOLOGY_KEYS, type TerminologyKey } from "@/lib/terminology";
import { ROLE_HOME, type AppRole } from "@/lib/roles";

export type SettingsResult = { error?: string; success?: string };

function sectionPath(role: AppRole) {
  return `${ROLE_HOME[role]}/pengaturan`;
}

/** Only ADMIN may mutate tenant configuration (rule #24/#29). */
async function requireAdmin() {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId || !session.tenantCode) {
    return null;
  }
  return session;
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  actorId: string,
  action: string,
  detail: Record<string, unknown>
) {
  await supabase.from("tenant_audit_log").insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    detail,
  });
}

/* ------------------------------------------------------------------------ */
/* TERMINOLOGY (rule #13-#16, #37)                                          */
/* ------------------------------------------------------------------------ */
export async function saveTerminologyAction(
  _prev: SettingsResult | null,
  formData: FormData
): Promise<SettingsResult> {
  const session = await requireAdmin();
  if (!session) return { error: "Hanya Admin yang dapat mengubah terminologi lembaga." };

  const supabase = await createClient();

  // Collect only changed keys (label -> custom, empty -> back to default).
  const updates: { tenant_id: string; key: TerminologyKey; label: string; updated_by: string }[] = [];
  const removes: TerminologyKey[] = [];
  const detail: Record<string, string> = {};

  for (const key of TERMINOLOGY_KEYS) {
    const raw = String(formData.get(`term_${key}`) ?? "").trim();
    const defaultValue = String(formData.get(`default_${key}`) ?? "").trim();
    if (!raw) continue; // untouched field
    if (raw === defaultValue) {
      removes.push(key); // reset to default = remove override
    } else {
      if (raw.length > 40) return { error: `Istilah "${raw}" terlalu panjang (maks 40 karakter).` };
      updates.push({
        tenant_id: session.tenantId!,
        key,
        label: raw,
        updated_by: session.id,
      });
      detail[key] = raw;
    }
  }

  if (updates.length === 0 && removes.length === 0) {
    return { error: "Tidak ada perubahan untuk disimpan." };
  }

  if (updates.length > 0) {
    const { error } = await supabase.from("terminologies").upsert(updates);
    if (error) return { error: "Gagal menyimpan terminologi." };
  }
  if (removes.length > 0) {
    const { error } = await supabase
      .from("terminologies")
      .delete()
      .in("key", removes)
      .eq("tenant_id", session.tenantId!);
    if (error) return { error: "Gagal mengembalikan istilah ke default." };
  }

  await writeAudit(supabase, session.tenantId!, session.id, "terminology.update", detail);

  invalidateTenantConfig(session.tenantCode, session.role);
  return { success: "Terminologi lembaga tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* IDENTITY TYPES — flexible per-tenant guru identity config (rule #10)     */
/* ------------------------------------------------------------------------ */
export async function saveIdentityTypesAction(
  _prev: SettingsResult | null,
  formData: FormData
): Promise<SettingsResult> {
  const session = await requireAdmin();
  if (!session) return { error: "Hanya Admin yang dapat mengubah identitas lembaga." };

  const labels = formData.getAll("identityLabel").map((v) => String(v).trim());
  const seen = new Set<string>();
  const types: { key: string; label: string }[] = [];

  for (const label of labels) {
    if (!label) continue;
    if (label.length > 30) return { error: `Label identitas "${label}" maksimal 30 karakter.` };
    const key = slugifyIdentity(label);
    if (seen.has(key)) return { error: `Identitas "${label}" duplikat.` };
    seen.add(key);
    types.push({ key, label });
  }

  const showTeacherIdentity = formData.get("showTeacherIdentity") === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").upsert({
    tenant_id: session.tenantId!,
    identity_types: types,
    show_teacher_identity: showTeacherIdentity,
  });
  if (error) return { error: "Gagal menyimpan konfigurasi identitas." };

  await writeAudit(supabase, session.tenantId!, session.id, "tenant_settings.identity", {
    identity_types: types,
    show_teacher_identity: showTeacherIdentity,
  });

  invalidateTenantConfig(session.tenantCode, session.role);
  return { success: "Konfigurasi identitas lembaga tersimpan." };
}

/** Delete one identity type + purge its values from teacher_identities. */
export async function deleteIdentityTypeAction(
  _prev: SettingsResult | null,
  formData: FormData
): Promise<SettingsResult> {
  const session = await requireAdmin();
  if (!session) return { error: "Hanya Admin yang dapat mengubah identitas lembaga." };

  const key = String(formData.get("key") ?? "");
  if (!key) return { error: "Identitas tidak valid." };

  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("identity_types, show_teacher_identity")
    .eq("tenant_id", session.tenantId!)
    .single();

  const current = parseIdentityTypes(settings?.identity_types);
  const next = current.filter((t) => t.key !== key);

  const { error } = await supabase.from("tenant_settings").upsert({
    tenant_id: session.tenantId!,
    identity_types: next,
    show_teacher_identity: settings?.show_teacher_identity ?? false,
  });
  if (error) return { error: "Gagal menghapus identitas." };

  await supabase
    .from("teacher_identities")
    .delete()
    .eq("tenant_id", session.tenantId!)
    .eq("identity_key", key);

  await writeAudit(supabase, session.tenantId!, session.id, "tenant_settings.identity_delete", { key });

  invalidateTenantConfig(session.tenantCode, session.role);
  return { success: `Identitas dihapus.` };
}

/* ------------------------------------------------------------------------ */
/* LEADER / KEPALA SEKOLAH (rule #12)                                       */
/* ------------------------------------------------------------------------ */
export async function saveLeaderAction(
  _prev: SettingsResult | null,
  formData: FormData
): Promise<SettingsResult> {
  const session = await requireAdmin();
  if (!session) return { error: "Hanya Admin yang dapat mengatur data pimpinan." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const frontTitle = String(formData.get("frontTitle") ?? "").trim();
  const backTitle = String(formData.get("backTitle") ?? "").trim();
  const identityKey = String(formData.get("identityKey") ?? "").trim();
  const identityNumber = String(formData.get("identityNumber") ?? "").trim();

  if (fullName && (fullName.length < 2 || fullName.length > 120))
    return { error: "Nama pimpinan harus 2-120 karakter." };
  if (frontTitle.length > 30) return { error: "Gelar depan maksimal 30 karakter." };
  if (backTitle.length > 30) return { error: "Gelar belakang maksimal 30 karakter." };
  if (identityNumber.length > 40) return { error: "Nomor identitas maksimal 40 karakter." };

  const supabase = await createClient();
  const payload = {
    tenant_id: session.tenantId!,
    full_name: fullName,
    front_title: frontTitle || null,
    back_title: backTitle || null,
    identity_key: identityKey || null,
    identity_number: identityNumber || null,
  };

  const { error } = await supabase
    .from("leader_profiles")
    .upsert(payload, { onConflict: "tenant_id" });
  if (error) return { error: "Gagal menyimpan data pimpinan." };

  await writeAudit(supabase, session.tenantId!, session.id, "leader.update", {
    full_name: fullName,
    identity_key: identityKey,
  });

  invalidateTenantConfig(session.tenantCode, session.role);
  return { success: "Data pimpinan tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* MENU ORDER — per user (rule #22-#23)                                     */
/* ------------------------------------------------------------------------ */
export async function saveMenuOrderAction(keys: string[]): Promise<SettingsResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  if (!Array.isArray(keys) || keys.length > 10) return { error: "Urutan menu tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ menu_order: keys })
    .eq("id", session.id);

  if (error) return { error: "Gagal menyimpan urutan menu." };

  invalidateTags(CACHE_KEYS.menuOrder(session.id));
  revalidatePath(sectionPath(session.role));
  revalidatePath(ROLE_HOME[session.role]);
  return { success: "Urutan menu tersimpan." };
}

export async function resetMenuOrderAction(): Promise<SettingsResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ menu_order: null })
    .eq("id", session.id);

  if (error) return { error: "Gagal mengembalikan urutan default." };

  invalidateTags(CACHE_KEYS.menuOrder(session.id));
  revalidatePath(sectionPath(session.role));
  revalidatePath(ROLE_HOME[session.role]);
  return { success: "Urutan menu kembali ke default." };
}

/* ------------------------------------------------------------------------ */
/* DASHBOARD QUICK MENU — per user, urutan + tampil/sembunyi (V31)          */
/* ------------------------------------------------------------------------ */
export async function saveDashboardQuickMenuAction(keys: string[]): Promise<SettingsResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  if (!Array.isArray(keys) || keys.length > 30 || keys.some((k) => typeof k !== "string" || k.length > 60)) {
    return { error: "Konfigurasi Menu Cepat tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ dashboard_quick_menu: keys })
    .eq("id", session.id);

  if (error) return { error: "Gagal menyimpan Menu Cepat." };

  revalidatePath(ROLE_HOME[session.role]);
  return { success: "Menu Cepat tersimpan." };
}

export async function resetDashboardQuickMenuAction(): Promise<SettingsResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ dashboard_quick_menu: null })
    .eq("id", session.id);

  if (error) return { error: "Gagal mengembalikan Menu Cepat ke default." };

  revalidatePath(ROLE_HOME[session.role]);
  return { success: "Menu Cepat kembali ke default." };
}
