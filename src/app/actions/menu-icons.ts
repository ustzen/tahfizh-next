"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { VALID_PHOSPHOR_NAMES } from "@/lib/menu-icons";

export type MenuIconResult = { error?: string; success?: string };

const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_ICON_BYTES = 512 * 1024; // 512 KB — selaras komentar migrasi V39

/** Menu key yang sah: huruf kecil, angka, strip, underscore (1-60). */
function isValidMenuKey(key: string): boolean {
  return /^[a-z0-9_-]{1,60}$/.test(key);
}

async function requireDeveloper() {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return null;
  return session;
}

function mapRpcError(message: string): string {
  if (message.includes("AKSES_DITOLAK")) return "Hanya Developer yang dapat mengubah ikon menu.";
  if (message.includes("MENU_KEY_TIDAK_VALID")) return "Menu tidak dikenal.";
  if (message.includes("NAMA_IKON_TIDAK_VALID")) return "Ikon Phosphor tidak dikenal.";
  if (message.includes("PATH_IKON_TIDAK_VALID")) return "Berkas ikon tidak valid.";
  return "Gagal menyimpan ikon menu. Coba lagi.";
}

/** Refresh seluruh layout (ikon tampil di sidebar/header/dashboard semua role). */
function revalidateAll() {
  revalidatePath("/", "layout");
}

/**
 * Simpan ikon Phosphor untuk satu menu.
 * `iconName` divalidasi terhadap katalog sebelum dikirim ke RPC.
 */
export async function saveMenuIconPhosphorAction(
  menuKey: string,
  iconName: string
): Promise<MenuIconResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah ikon menu." };
  if (!isValidMenuKey(menuKey)) return { error: "Menu tidak dikenal." };
  if (!VALID_PHOSPHOR_NAMES.has(iconName)) return { error: "Ikon Phosphor tidak dikenal." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("menu_icon_save", {
    p_menu_key: menuKey,
    p_icon_kind: "PHOSPHOR",
    p_icon_name: iconName,
  });
  if (error) return { error: mapRpcError(error.message) };

  revalidateAll();
  return { success: "Ikon menu diperbarui." };
}

/**
 * Unggah gambar custom untuk satu menu lalu tautkan ke menu tersebut.
 * Unggahan memakai service-role ke bucket publik `menu-icons` (klien tidak
 * pernah upload langsung), nama berkas acak — anti path-traversal.
 */
export async function uploadMenuIconAction(formData: FormData): Promise<MenuIconResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah ikon menu." };

  const menuKey = String(formData.get("menuKey") ?? "");
  if (!isValidMenuKey(menuKey)) return { error: "Menu tidak dikenal." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih berkas gambar terlebih dahulu." };
  if (!ALLOWED_ICON_TYPES.includes(file.type))
    return { error: "Format harus PNG, JPG, WebP, atau SVG." };
  if (file.size > MAX_ICON_BYTES) return { error: "Ukuran gambar maksimal 512 KB." };

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/svg+xml"
          ? "svg"
          : "jpg";
  const objectKey = `menu-icons/${menuKey}-${randomUUID().slice(0, 8)}.${ext}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("menu-icons")
    .upload(objectKey, buffer, { contentType: file.type, upsert: false });
  if (uploadErr) return { error: "Gagal mengunggah gambar ikon." };

  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("menu_icon_save", {
    p_menu_key: menuKey,
    p_icon_kind: "CUSTOM",
    p_icon_name: objectKey,
  });
  if (rpcErr) {
    // Jangan tinggalkan berkas yatim bila penautan gagal.
    await admin.storage.from("menu-icons").remove([objectKey]);
    return { error: mapRpcError(rpcErr.message) };
  }

  revalidateAll();
  return { success: "Ikon custom dipasang." };
}

/** Reset ikon satu menu ke bawaan (hapus baris + berkas custom). */
export async function resetMenuIconAction(menuKey: string): Promise<MenuIconResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah ikon menu." };
  if (!isValidMenuKey(menuKey)) return { error: "Menu tidak dikenal." };

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("menu_icon_reset", { p_menu_key: menuKey });
  if (error) return { error: mapRpcError(error.message) };

  if (typeof path === "string" && path) {
    const admin = createAdminClient();
    await admin.storage.from("menu-icons").remove([path]);
  }

  revalidateAll();
  return { success: "Ikon kembali ke bawaan." };
}

/** Reset SEMUA ikon menu ke bawaan. */
export async function resetAllMenuIconsAction(): Promise<MenuIconResult> {
  const session = await requireDeveloper();
  if (!session) return { error: "Hanya Developer yang dapat mengubah ikon menu." };

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("menu_icon_reset_all");
  if (error) return { error: mapRpcError(error.message) };

  const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : [];
  if (list.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from("menu-icons").remove(list);
  }

  revalidateAll();
  return { success: "Semua ikon kembali ke bawaan." };
}
