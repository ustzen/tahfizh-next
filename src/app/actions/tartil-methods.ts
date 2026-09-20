"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { ActionResult } from "@/app/actions/crud";

/**
 * V12.14 — Kelola METODE baca Tartil (Pengaturan → Tartil, Admin).
 * Metode = buku/seri baca (Iqro, Ummi, Tartili, Tilawati, Qiro'ati, Wafa,
 * Yanbua, … atau isi sendiri) + jumlah jilid. Jilid per metode di-generate
 * ke daftar materi via RPC tartil_method_generate_jilids.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function createTartilMethodAction(input: {
  name: string;
  jilidCount: number;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mengatur metode." };
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) return { error: "Nama metode 1-60 karakter." };
  const jilid = Math.floor(Number(input.jilidCount));
  if (!Number.isFinite(jilid) || jilid < 0 || jilid > 30) {
    return { error: "Jumlah jilid 0-30." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tartil_methods").insert({
    tenant_id: profile.tenantId,
    name,
    jilid_count: jilid,
  });
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { error: "Metode dengan nama itu sudah ada." };
    }
    return { error: "Gagal menambah metode. Coba lagi." };
  }

  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
  return { success: `Metode "${name}" ditambahkan.` };
}

export async function updateTartilMethodAction(input: {
  id: string;
  name: string;
  jilidCount: number;
}): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mengatur metode." };
  }
  if (!UUID_RE.test(input.id)) return { error: "Data metode tidak valid." };
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) return { error: "Nama metode 1-60 karakter." };
  const jilid = Math.floor(Number(input.jilidCount));
  if (!Number.isFinite(jilid) || jilid < 0 || jilid > 30) {
    return { error: "Jumlah jilid 0-30." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_methods")
    .update({ name, jilid_count: jilid })
    .eq("id", input.id)
    .eq("tenant_id", profile.tenantId);
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { error: "Metode dengan nama itu sudah ada." };
    }
    return { error: "Gagal menyimpan metode. Coba lagi." };
  }

  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
  return { success: "Metode diperbarui." };
}

export async function setTartilMethodActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mengatur metode." };
  }
  if (!UUID_RE.test(id)) return { error: "Data metode tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tartil_methods")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal mengubah status metode." };

  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
  return { success: isActive ? "Metode diaktifkan." : "Metode dinonaktifkan." };
}

export async function deleteTartilMethodAction(id: string): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "ADMIN" || !profile.tenantId) {
    return { error: "Hanya Admin lembaga yang dapat mengatur metode." };
  }
  if (!UUID_RE.test(id)) return { error: "Data metode tidak valid." };

  const supabase = await createClient();
  // Hapus hanya baris metode — materi/jilid & penilaian tidak tersentuh.
  const { error } = await supabase
    .from("tartil_methods")
    .delete()
    .eq("id", id)
    .eq("tenant_id", profile.tenantId);
  if (error) return { error: "Gagal menghapus metode." };

  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
  return { success: "Metode dihapus (materi jilid tetap ada)." };
}
