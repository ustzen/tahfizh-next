import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * TAHFIZH V12.11 — Resolusi baris guru dari sesi profil.
 *
 * Utama: teachers.profile_id = profiles.id (link UUID — migration
 * 20260918020000). Akurat walau nama profil berbeda dengan nama guru
 * (gelar, spasi, nama diedit). Fallback: pencocokan nama persis (data lama
 * yang belum ter-backfill). Semua modul guru memakai fungsi ini sehingga
 * tidak ada lagi bug "data kosong" karena nama tidak cocok.
 */
export const getTeacherForProfile = cache(async (): Promise<{ id: string } | null> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) return null;
  const supabase = await createClient();

  // 1. Utama: link UUID.
  const byId = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byId.data) return byId.data;

  // 2. Fallback: nama persis (tenant-scoped; RLS menegakkan isolasi).
  if (!profile.fullName) return null;
  const byName = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .ilike("full_name", profile.fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byName.data ?? null;
});
