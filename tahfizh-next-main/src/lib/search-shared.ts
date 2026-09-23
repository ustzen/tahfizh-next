/**
 * TAHFIZH V12 — client-safe search constants (no server imports).
 * Server-side RPC access lives in src/lib/search.ts (import "server-only").
 */

export type SearchHitType = "SANTRI" | "GURU" | "HALAQAH" | "LEMBAGA";

export type SearchHit = {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const SEARCH_GROUP_LABEL: Record<SearchHitType, string> = {
  SANTRI: "Santri",
  GURU: "Guru",
  HALAQAH: "Halaqah",
  LEMBAGA: "Lembaga",
};

export function searchGroupLabel(type: SearchHitType): string {
  return SEARCH_GROUP_LABEL[type] ?? type;
}

/** Minimal 2 karakter sebelum query dikirim ke server. */
export function isSearchableQuery(q: string): boolean {
  return q.trim().length >= 2;
}
