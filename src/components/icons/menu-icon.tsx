"use client";

/**
 * V39 — MenuIcon: renderer ikon menu terpadu.
 *
 * Menampilkan override ikon menu (Phosphor pilihan developer atau gambar
 * custom terunggah) dan otomatis fallback ke ikon lucide bawaan saat tidak
 * ada override. Semua konsumen (sidebar, header, menu bawah, menu cepat)
 * memakai komponen ini agar tampilan ikon konsisten.
 */
import { menuIconPhosphorName, menuIconCustomUrl, type MenuIconOverride } from "@/lib/menu-icons";
import { getPhosphorIcon } from "@/components/icons/phosphor-icons";

export function MenuIcon({
  menuKey,
  overrides,
  fallback,
  className,
}: {
  /** menu_key (NavKey atau key Menu Cepat). */
  menuKey: string;
  /** Daftar override ikon menu platform (boleh null). */
  overrides: MenuIconOverride[] | null | undefined;
  /** Ikon lucide bawaan saat tidak ada override. */
  fallback: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const customUrl = menuIconCustomUrl(overrides, menuKey);
  if (customUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- aset statis bucket publik
      <img src={customUrl} alt="" className={`${className ?? ""} object-contain`} />
    );
  }
  const phosphorName = menuIconPhosphorName(overrides, menuKey);
  if (phosphorName) {
    const PhosphorIcon = getPhosphorIcon(phosphorName);
    if (PhosphorIcon) return <PhosphorIcon className={className} />;
  }
  const Fallback = fallback;
  return <Fallback className={className} />;
}
