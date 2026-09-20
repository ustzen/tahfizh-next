/**
 * Tenant-configurable guru identity types (NIP / NBM / NUPTK / NIY / custom).
 * Stored in tenant_settings.identity_types as [{key,label}] — flexible, so a
 * lembaga can define any identity type; values live in teacher_identities.
 */
export type IdentityType = { key: string; label: string };

export function parseIdentityTypes(raw: unknown): IdentityType[] {
  if (!Array.isArray(raw)) return [];
  const out: IdentityType[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { key?: unknown }).key === "string" &&
      typeof (item as { label?: unknown }).label === "string"
    ) {
      const key = (item as { key: string }).key.trim().toLowerCase().replace(/\s+/g, "_");
      const label = (item as { label: string }).label.trim();
      if (key && label) out.push({ key, label });
    }
  }
  return out;
}

export function slugifyIdentity(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}
