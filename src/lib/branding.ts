/**
 * V60 — Branding layar login (Pengaturan Developer).
 *
 * Logo & gambar hero di /masuk dapat diganti Developer (platform-wide).
 * Nilai disimpan di tabel `platform_settings` (key = 'login') yang di-RLS
 * deny-all: pembacaan memakai service-role (halaman login anonim tidak punya
 * sesi), penulisan hanya via RPC SECURITY DEFINER khusus DEVELOPER.
 * File aset berada di bucket publik `branding` → cukup URL publik.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginBranding = {
  logoPath: string | null;
  heroPath: string | null;
};

export async function getLoginBranding(): Promise<LoginBranding> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "login")
    .maybeSingle();

  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    logoPath: typeof value.logo_path === "string" && value.logo_path ? value.logo_path : null,
    heroPath: typeof value.hero_path === "string" && value.hero_path ? value.hero_path : null,
  };
}

const BRANDING_PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/branding/`;

/** Bangun URL publik dari path storage bucket `branding`. */
export function brandingPublicUrl(path: string): string {
  return `${BRANDING_PUBLIC_BASE}${path}`;
}
