"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { invalidateProfile } from "@/lib/cache";
import type { AppRole } from "@/lib/roles";

export type ProfileResult = { error?: string; success?: string };

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

function sectionPath(role: AppRole) {
  return `/${role.toLowerCase()}/pengaturan`;
}

function revalidateSettings(role: AppRole) {
  revalidatePath(sectionPath(role));
  revalidatePath(sectionPath(role) + "/profil");
  revalidatePath(sectionPath(role) + "/keamanan");
  revalidatePath(`/${role.toLowerCase()}`);
}

/* ------------------------------------------------------------------------ */
/* PROFILE — every role edits only their OWN profile (RLS also enforces).    */
/* ------------------------------------------------------------------------ */
export async function updateProfileAction(
  _prev: ProfileResult | null,
  formData: FormData
): Promise<ProfileResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir. Silakan login kembali." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const frontTitle = String(formData.get("frontTitle") ?? "").trim();
  const backTitle = String(formData.get("backTitle") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();

  if (fullName.length < 2 || fullName.length > 120)
    return { error: "Nama lengkap harus 2-120 karakter." };
  if (frontTitle.length > 30) return { error: "Gelar depan maksimal 30 karakter." };
  if (backTitle.length > 30) return { error: "Gelar belakang maksimal 30 karakter." };
  if (whatsapp && !/^\+?[0-9]{8,15}$/.test(whatsapp))
    return { error: "Nomor WhatsApp tidak valid (contoh: 081234567890)." };
  if (gender && gender !== "L" && gender !== "P") return { error: "Gender tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      front_title: frontTitle || null,
      back_title: backTitle || null,
      whatsapp: whatsapp || null,
      ...(session.role === "USTADZ" || session.role === "ADMIN" || session.role === "KOORDINATOR"
        ? { gender: gender || null }
        : {}),
    })
    .eq("id", session.id);

  if (error) return { error: "Gagal menyimpan profil." };

  invalidateProfile(session.id, session.role, session.tenantCode);
  revalidateSettings(session.role);
  return { success: "Profil berhasil diperbarui." };
}

/* ------------------------------------------------------------------------ */
/* AVATAR — Supabase Storage, per-user folder, type & size enforced.         */
/* ------------------------------------------------------------------------ */
export async function uploadAvatarAction(
  _prev: ProfileResult | null,
  formData: FormData
): Promise<ProfileResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih foto terlebih dahulu." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { error: "Format harus JPG, PNG, atau WebP." };
  if (file.size > MAX_AVATAR_BYTES) return { error: "Ukuran foto maksimal 2 MB." };

  const supabase = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${session.id}/avatar.${ext}`;

  // Upsert overwrites the user's own previous avatar (same path per format).
  const { error: uploadErr } = await supabase.storage
    .from("profile-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadErr) return { error: "Gagal mengunggah foto." };

  // Private bucket: signed URL with long-ish cache (1 hour), regenerated per request.
  const { data: signed } = await supabase.storage
    .from("profile-photos")
    .createSignedUrl(path, 60 * 60);

  const avatarUrl = signed?.signedUrl ?? path;
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", session.id);

  if (updateErr) return { error: "Foto terunggah namun gagal ditautkan ke profil." };

  invalidateProfile(session.id, session.role, session.tenantCode);
  revalidateSettings(session.role);
  return { success: "Foto profil diperbarui." };
}

export async function deleteAvatarAction(): Promise<ProfileResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", session.id)
    .single();

  if (profile?.avatar_url) {
    // Path is namespaced by user id — a user can only ever delete own file.
    await supabase.storage.from("profile-photos").remove([profile.avatar_url]);
  }
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", session.id);

  invalidateProfile(session.id, session.role, session.tenantCode);
  revalidateSettings(session.role);
  return { success: "Foto profil dihapus." };
}

/* ------------------------------------------------------------------------ */
/* EMAIL — Supabase Auth secure flow.                                       */
/* ------------------------------------------------------------------------ */
export async function updateEmailAction(
  _prev: ProfileResult | null,
  formData: FormData
): Promise<ProfileResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (email === session.email.toLowerCase()) return { error: "Email baru sama dengan email saat ini." };

  const supabase = await createClient();
  // Supabase may require confirming the new email (secure default flow);
  // we never write to auth.users directly.
  const { error } = await supabase.auth.updateUser({ email });

  if (error) {
    return { error: error.message.includes("confirmed")
      ? "Email konfirmasi telah dikirim ke alamat baru. Buka tautan untuk menyelesaikan perubahan."
      : "Gagal mengubah email. Coba lagi." };
  }

  revalidateSettings(session.role);
  return {
    success:
      "Email diperbarui. Jika konfirmasi diaktifkan, cek inbox email baru Anda untuk verifikasi.",
  };
}

/* ------------------------------------------------------------------------ */
/* PASSWORD — via Supabase Auth.                                            */
/* ------------------------------------------------------------------------ */
export async function updatePasswordAuthedAction(
  _prev: ProfileResult | null,
  formData: FormData
): Promise<ProfileResult> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };

  const oldPassword = String(formData.get("oldPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Password baru minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };

  const supabase = await createClient();

  // Verify the old password by re-authenticating (never trust the client).
  if (oldPassword) {
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: session.email,
      password: oldPassword,
    });
    if (reauthErr) return { error: "Password lama tidak sesuai." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Gagal mengganti password. Coba lagi." };

  return { success: "Password berhasil diganti." };
}
