/**
 * Central role/terminology definitions.
 * V2 terminology editor will read/write tenants.terminology and this module
 * stays the single place where labels resolve.
 */
export const APP_ROLES = ["DEVELOPER", "ADMIN", "KOORDINATOR", "USTADZ", "WALI_SANTRI"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type TenantKind =
  | "SEKOLAH"
  | "TPQ"
  | "RUMAH_TAHFIZH"
  | "MADRASAH"
  | "LEMBAGA_ALQURAN"
  | "LAINNYA";

export type Gender = "L" | "P";
export type EntityStatus = "ACTIVE" | "INACTIVE";
export type TenantStatus = "ACTIVE" | "INACTIVE";

export const TENANT_KINDS: { value: TenantKind; label: string }[] = [
  { value: "SEKOLAH", label: "Sekolah" },
  { value: "TPQ", label: "TPQ" },
  { value: "RUMAH_TAHFIZH", label: "Rumah Tahfizh" },
  { value: "MADRASAH", label: "Madrasah" },
  { value: "LEMBAGA_ALQURAN", label: "Lembaga Al-Qur'an" },
  { value: "LAINNYA", label: "Lainnya" },
];

export function tenantKindLabel(kind: string) {
  return TENANT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/**
 * V12 — Role yang dikenal pengguna: Admin, Koordinator, Guru (Ustadz),
 * Santri. "WALI_SANTRI" di dalam DB tetap dipakai untuk role santri karena
 * enum lama tidak boleh diubah (migration V1–V12 aman), tapi SEMUA label UI
 * menampilkan "Santri".
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  DEVELOPER: "Developer",
  ADMIN: "Admin",
  KOORDINATOR: "Koordinator",
  USTADZ: "Ustadz",
  WALI_SANTRI: "Santri",
};

/** Route home for each role (used after login and by middleware). */
export const ROLE_HOME: Record<AppRole, string> = {
  DEVELOPER: "/developer",
  ADMIN: "/admin",
  KOORDINATOR: "/koordinator",
  USTADZ: "/ustadz",
  WALI_SANTRI: "/santri",
};

/**
 * Menu model — single source for sidebar/header/prefetch.
 * V2: Pengaturan appended for every role; final order may be overridden
 * per-user via profiles.menu_order (resolved in lib/terminology.ts).
 */
export type NavItem = { label: string; href: string; prefetch?: boolean };

export const ROLE_NAV: Record<AppRole, NavItem[]> = {
  DEVELOPER: [
    { label: "Dashboard", href: "/developer" },
    { label: "Lembaga", href: "/developer/lembaga" },
    { label: "Infak", href: "/developer/infak" },
    { label: "Raport", href: "/developer/raport" },
    { label: "Kritik & Saran", href: "/developer/saran" },
    { label: "Pengaturan", href: "/developer/pengaturan" },
  ],
  ADMIN: [
    { label: "Dashboard", href: "/admin" },
    { label: "Data Guru", href: "/admin/guru" },
    { label: "Data Santri", href: "/admin/santri" },
    { label: "Halaqah", href: "/admin/halaqah" },
    { label: "Akademik", href: "/admin/akademik" },
    { label: "Onboarding", href: "/admin/onboarding" },
    { label: "Raport", href: "/admin/raport" },
    { label: "Obrolan", href: "/admin/obrolan" },
    { label: "Kritik & Saran", href: "/admin/saran" },
    { label: "Pengaturan", href: "/admin/pengaturan" },
  ],
  KOORDINATOR: [
    { label: "Dashboard", href: "/koordinator" },
    { label: "Data Guru", href: "/koordinator/guru" },
    { label: "Data Santri", href: "/koordinator/santri" },
    { label: "Halaqah", href: "/koordinator/halaqah" },
    { label: "Riwayat Perkembangan", href: "/koordinator/perkembangan" },
    { label: "Raport", href: "/koordinator/raport" },
    { label: "Obrolan", href: "/koordinator/obrolan" },
    { label: "Kritik & Saran", href: "/koordinator/saran" },
    { label: "Pengaturan", href: "/koordinator/pengaturan" },
  ],
  USTADZ: [
    { label: "Dashboard", href: "/ustadz" },
    { label: "Santri", href: "/ustadz/santri" },
    { label: "Tahfidz", href: "/ustadz/tahfidz" },
    { label: "Tartil", href: "/ustadz/tartil" },
    { label: "Setoran", href: "/ustadz/setoran" },
    { label: "Hadits", href: "/ustadz/hadits" },
    { label: "Doa Harian", href: "/ustadz/doa" },
    { label: "Tajwid", href: "/ustadz/tajwid" },
    { label: "Tugas", href: "/ustadz/tugas" },
    { label: "Custom Jurnal", href: "/ustadz/jurnal" },
    { label: "Target", href: "/ustadz/target" },
    { label: "Halaqah", href: "/ustadz/halaqah" },
    { label: "Presensi", href: "/ustadz/presensi" },
    { label: "Riwayat Perkembangan", href: "/ustadz/perkembangan" },
    { label: "Raport", href: "/ustadz/raport" },
    { label: "WhatsApp", href: "/ustadz/whatsapp" },
    { label: "Obrolan", href: "/ustadz/obrolan" },
    { label: "Kritik & Saran", href: "/ustadz/saran" },
    { label: "Pengaturan", href: "/ustadz/pengaturan" },
  ],
  WALI_SANTRI: [
    { label: "Dashboard", href: "/santri" },
    { label: "Data Saya", href: "/santri/anak" },
    { label: "Pantauan Pembelajaran", href: "/santri/pantauan" },
    { label: "Target", href: "/santri/target" },
    { label: "Presensi", href: "/santri/presensi" },
    { label: "Kartu Prestasi", href: "/santri/prestasi" },
    { label: "Riwayat Perkembangan", href: "/santri/perkembangan" },
    { label: "Infak Pengembangan", href: "/santri/infak" },
    { label: "Obrolan", href: "/santri/obrolan" },
    { label: "Kritik & Saran", href: "/santri/saran" },
    { label: "Pengaturan", href: "/santri/pengaturan" },
  ],
};

/** Settings sections available to a role (rule #24). */
export function settingsSectionsFor(role: AppRole) {
  const base = [
    { key: "profil", label: "Profil", href: `/${role.toLowerCase()}/pengaturan/profil` },
    { key: "keamanan", label: "Keamanan", href: `/${role.toLowerCase()}/pengaturan/keamanan` },
    { key: "menu", label: "Tampilan & Menu", href: `/${role.toLowerCase()}/pengaturan/menu` },
  ];
  if (role === "ADMIN") {
    base.push(
      { key: "tahfidz", label: "Tahfidz", href: "/admin/pengaturan/tahfidz" },
      { key: "tartil", label: "Tartil", href: "/admin/pengaturan/tartil" },
      { key: "setoran", label: "Setoran", href: "/admin/pengaturan/setoran" },
      { key: "materi", label: "Materi Pembelajaran", href: "/admin/pengaturan/materi" },
      { key: "jurnal", label: "Custom Jurnal", href: "/admin/pengaturan/jurnal" },
      { key: "terminologi", label: "Terminologi", href: "/admin/pengaturan/terminologi" },
      { key: "identitas", label: "Identitas Lembaga", href: "/admin/pengaturan/identitas" },
      { key: "pimpinan", label: "Pimpinan", href: "/admin/pengaturan/pimpinan" },
      { key: "audit", label: "Log Aktivitas", href: "/admin/pengaturan/audit" }
    );
  }
  return base;
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role as AppRole] ?? role;
}

export function genderLabel(g: string | null | undefined) {
  return g === "L" ? "Laki-laki" : g === "P" ? "Perempuan" : "-";
}
