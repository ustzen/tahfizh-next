-- ============================================================================
-- TAHFIZH V31 — Menu Cepat (dashboard quick menu) per-user customization
--
-- Guru (dan role lain yang punya dashboard Menu Cepat) dapat mengatur urutan
-- serta menyembunyikan/menampilkan item Menu Cepat di halaman overview
-- masing-masing. Disimpan terpisah dari `menu_order` (yang mengatur urutan
-- sidebar) agar tidak saling mempengaruhi.
--
-- dashboard_quick_menu: jsonb array of keys (string), urutan sesuai preferensi
-- pengguna. Key yang TIDAK ada di array dianggap disembunyikan. NULL/kosong
-- = pakai urutan & tampilan default (semua item tampil, urutan bawaan).
-- ============================================================================

alter table public.profiles
  add column if not exists dashboard_quick_menu jsonb;
