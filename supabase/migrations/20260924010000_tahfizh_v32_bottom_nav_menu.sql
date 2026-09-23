-- ============================================================================
-- TAHFIZH V32 — Menu Bawah (mobile bottom nav) per-user customization
--
-- Bar navigasi bawah khusus tampilan mobile (semua role), berisi maksimal 4
-- menu pilihan pengguna dari seluruh menu yang tersedia untuk role tersebut.
-- Disimpan terpisah dari `menu_order` (urutan sidebar) dan
-- `dashboard_quick_menu` (grid Menu Cepat) agar tidak saling memengaruhi.
--
-- bottom_nav_menu: jsonb array of keys (string), maksimal 4, urutan sesuai
-- preferensi pengguna. NULL/kosong = pakai 4 item default per role
-- (lihat BOTTOM_NAV_DEFAULT_KEYS di src/lib/terminology.ts).
-- ============================================================================

alter table public.profiles
  add column if not exists bottom_nav_menu jsonb;
