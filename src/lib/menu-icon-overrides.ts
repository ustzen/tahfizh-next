import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { MenuIconOverride } from "@/lib/menu-icons";

/**
 * V39 — Muat override ikon menu platform (tabel `menu_icons`).
 *
 * Tabel hanya bisa dibaca lewat SECURITY DEFINER helper `menu_icons_all()`
 * (RLS menolak akses langsung), jadi kita panggil RPC-nya. Gagal dibaca
 * (mis. migrasi belum jalan / RPC belum ada) dikembalikan sebagai daftar
 * kosong agar seluruh dashboard tetap tampil dengan ikon bawaan.
 */
export const getMenuIconOverrides = cache(async (): Promise<MenuIconOverride[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("menu_icons_all");
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[menu-icons] gagal memuat override:", error.message);
    }
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as {
    menu_key: string;
    icon_kind: string;
    icon_name: string | null;
    storage_path: string | null;
  }[];

  return rows
    .filter((r) => r.menu_key && (r.icon_kind === "PHOSPHOR" || r.icon_kind === "CUSTOM"))
    .map((r) => ({
      menuKey: r.menu_key,
      kind: r.icon_kind as MenuIconOverride["kind"],
      iconName: r.icon_name,
      storagePath: r.storage_path,
    }));
});
