"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";

export type BrandingResult = { error?: string; success?: string };

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — cukup untuk logo & ilustrasi hero

type LoginSettingValue = {
  logo_path?: string | null;
  hero_path?: string | null;
};

async function requireDeveloper() {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return null;
  return session;
}

/** Ambil nilai setting login saat ini (via service-role, RLS deny-all). */
async function getLoginValue(): Promise<LoginSettingValue> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "login")
    .maybeSingle();
  return ((data?.value ?? {}) as LoginSettingValue) ?? {};
}

/** Simpan nilai setting login via RPC SECURITY DEFINER (khusus DEVELOPER). */
async function saveLoginValue(value: LoginSettingValue): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_settings_save", {
    p_key: "login",
    p_value: value,
  });
  if (error) {
    if (error.message.includes("AKSES_DITOLAK")) return "Hanya Developer yang dapat mengubah branding.";
    if (error.message.includes("NILAI_TIDAK_VALID")) return "Nilai branding tidak valid.";
    return "Gagal menyimpan branding. Coba lagi.";
  }
  return null;
}

function revalidateLogin() {
  revalidatePath("/masuk");
}

export async function uploadLoginAssetAction(input: {
  kind: "LOGO" | "HERO";
  file: File;
}): Promise<BrandingResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah branding login." };
  if (!(input.file instanceof File) || input.file.size === 0)
    return { error: "Pilih berkas gambar terlebih dahulu." };
  if (!ALLOWED_TYPES.includes(input.file.type))
    return { error: "Format harus PNG, JPG, WebP, atau SVG." };
  if (input.file.size > MAX_BYTES) return { error: "Ukuran gambar maksimal 2 MB." };

  const ext =
    input.file.type === "image/svg+xml"
      ? "svg"
      : input.file.type === "image/png"
        ? "png"
        : input.file.type === "image/webp"
          ? "webp"
          : "jpg";
  // Nama acak — anti path-traversal; lampirkan extensi tipe asli.
  const objectKey = `branding/login-${input.kind.toLowerCase()}-${randomUUID().slice(0, 8)}.${ext}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("branding")
    .upload(objectKey, buffer, { contentType: input.file.type, upsert: false });
  if (uploadErr) return { error: "Gagal mengunggah gambar. Periksa bucket branding." };

  const current = await getLoginValue();
  const next: LoginSettingValue =
    input.kind === "LOGO"
      ? { ...current, logo_path: objectKey }
      : { ...current, hero_path: objectKey };

  const saveErr = await saveLoginValue(next);
  if (saveErr) {
    // Jangan tinggalkan berkas yatim bila penautan gagal.
    await admin.storage.from("branding").remove([objectKey]);
    return { error: saveErr };
  }

  // Hapus berkas lama supaya bucket tidak menumpuk.
  const oldPath = input.kind === "LOGO" ? current.logo_path : current.hero_path;
  if (oldPath) await admin.storage.from("branding").remove([oldPath]);

  revalidateLogin();
  return { success: input.kind === "LOGO" ? "Logo layar login diperbarui." : "Gambar hero diperbarui." };
}

export async function resetLoginAssetAction(input: { kind: "LOGO" | "HERO" }): Promise<BrandingResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah branding login." };

  const current = await getLoginValue();
  const oldPath = input.kind === "LOGO" ? current.logo_path : current.hero_path;

  const next: LoginSettingValue =
    input.kind === "LOGO"
      ? { ...current, logo_path: null }
      : { ...current, hero_path: null };
  const saveErr = await saveLoginValue(next);
  if (saveErr) return { error: saveErr };

  if (oldPath) {
    const admin = createAdminClient();
    await admin.storage.from("branding").remove([oldPath]);
  }

  revalidateLogin();
  return { success: "Kembali ke bawaan." };
}
