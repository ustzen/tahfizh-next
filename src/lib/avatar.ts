import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * TAHFIZH V49 — Signed URL untuk foto profil (bucket privat profile-photos).
 * Path dipakai sebagai format tersimpan; URL dibuat per render dan berlaku
 * 1 jam. Data lama berupa URL penuh tetap dilewatkan apa adanya.
 */
export async function signAvatarPath(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("profile-photos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
