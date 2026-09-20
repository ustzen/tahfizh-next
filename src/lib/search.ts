import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";

import { isSearchableQuery, type SearchHit, type SearchHitType } from "@/lib/search-shared";

export { isSearchableQuery, searchGroupLabel } from "@/lib/search-shared";
export type { SearchHit, SearchHitType } from "@/lib/search-shared";

/**
 * TAHFIZH V12 — Global Search (SERVER ONLY).
 *
 * Semua pencarian berjalan lewat RPC `search_global` yang dieksekusi dengan
 * koneksi user (security invoker) sehingga RLS + verifikasi role tetap
 * berlaku — search tidak bisa melewati tenant isolation. Hasil hanya berisi
 * nama/label kontekstual; ID internal tidak pernah dikirim ke UI.
 */

/** Role double-check di sisi aplikasi (defence in depth terhadap RLS). */
const ALLOWED_TYPES: Record<SearchHitType, AppRole[]> = {
  SANTRI: ["ADMIN", "KOORDINATOR", "USTADZ", "WALI_SANTRI"],
  GURU: ["ADMIN", "KOORDINATOR"],
  HALAQAH: ["ADMIN", "KOORDINATOR"],
  LEMBAGA: ["DEVELOPER"],
};

export const getGlobalSearchResults = cache(
  async (query: string, role: AppRole): Promise<SearchHit[]> => {
    if (!isSearchableQuery(query)) return [];

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_global", { p_query: query.trim() });
    if (error) {
      console.error("[search_global]", error.message);
      return [];
    }

    const rows = (data ?? []) as {
      type: string;
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
    }[];

    return rows
      .filter((r) => (ALLOWED_TYPES[r.type as SearchHitType] ?? []).includes(role))
      .map((r) => ({
        type: r.type as SearchHitType,
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        href: r.href,
      }))
      .slice(0, 12);
  }
);
