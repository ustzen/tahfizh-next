# V88 — Raport guru disederhanakan + 3 template bawaan dengan 5 komponen utama

## Isi utama raport (semua template)
1. Tartil Al-Qur’an  2. Tahfidz Al-Qur’an  3. Hadits Pilihan  4. Doa Harian  5. Presensi

## Yang berubah
- `src/app/ustadz/raport/page.tsx` — ditulis ulang, hanya memanggil hub baru.
- `src/components/report/teacher-raport-hub.tsx` (baru) — dua tab:
  **Template Raport** (template lembaga + 3 template dasar; “Pakai dan ubah” =
  salin ke lembaga lalu buka Report Builder; “Jadikan utama”) dan **Raport Santri**.
- `src/components/report/component-content.tsx` — Tabel Nilai kini membaca
  `props.modules` (urutan sesuai daftar). Tanpa `props.modules` perilaku lama
  tetap. Modul kustom hanya tampil bila dipilih lewat `props.customModules`
  (atau `modules` tidak diatur).
- `src/components/report/report-builder.tsx` — panel properti Tabel Nilai
  mendapat daftar centang materi (Tartil, Tahfidz, Hadits, Doa, Setoran, Tajwid, Tugas).
- `supabase/migrations/20260929100000_tahfizh_v88_raport_3_template_lima_komponen.sql`
  — template global tepat tiga: Raport 1 Kolom, Raport 2 Kolom (contoh utama),
  Raport 3 Kolom. “Raport 2 Kolom Modern” dan “Raport Fleksibel (2 Halaman)”
  dinonaktifkan dari katalog. Salinan milik lembaga tidak disentuh.

## Catatan
- Kotak “Catatan Guru” di template sengaja kosong agar teks contoh tidak ikut
  tercetak di raport santri sungguhan.
- Template global tetap tidak bisa disunting guru (dipagari RPC), hanya disalin.

## Verifikasi (dijalankan)
`npx tsc --noEmit` bersih · `node scripts/sql-parse-check.mjs` OK ·
`node scripts/verify-raport-edit.mjs` lulus.
