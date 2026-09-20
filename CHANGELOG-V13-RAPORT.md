# V13 — Raport: galeri contoh + Raport Utama Lembaga

## Ringkasan
Bagian Raport diubah total. Halaman tidak lagi menampilkan daftar nama
template, melainkan **langsung merender contoh raportnya** memakai renderer
cetak yang sama (`ReportCanvas`) dengan data contoh.

## Yang berubah

### Tampilan
- `src/components/report/report-thumbnail.tsx` — pratinjau raport ukuran kecil
  (halaman pertama, diperkecil dengan CSS transform, bukan gambar tiruan).
- `src/components/report/template-gallery.tsx` — galeri baru: panel **Raport
  Utama Lembaga** di atas, grid **Template Lembaga**, lalu **Contoh Raport
  Bawaan**.
- `src/components/report/template-example.tsx` — halaman "Lihat Contoh":
  raport seukuran cetak + tombol Cetak/PDF, Ubah Template, dan Jadikan Raport
  Utama.
- Route baru `/{admin,koordinator,ustadz,developer}/raport/contoh/[templateId]`.
- Halaman hub ditulis ulang untuk admin, developer, koordinator, dan guru.
- Dihapus: `report-template-manager.tsx`, `dev-template-manager.tsx`.

### Komponen raport baru (tersedia di Report Builder)
`SECTION_HEADING`, `DIVIDER`, `BOX`, `STUDENT_PHOTO`, `GRADE_LEGEND`.
`ReportStyle` menerima `color`, `borderColor`, dan `radius`.

### Template bawaan
Ketiga template global diperbarui. **Raport 2 Kolom** menjadi contoh utama:
kop berpanel + logo, judul, tahun ajaran & semester; kolom kiri identitas
santri, rekapitulasi nilai, rekap presensi; kolom kanan capaian periode,
keterangan predikat, catatan guru; ditutup tanda tangan dua sisi dan footer.

### Hak akses
Migrasi `supabase/migrations/20260920200000_tahfizh_v13_raport_galeri_utama.sql`:
- kolom `report_templates.is_primary` + indeks unik (satu raport utama per
  lembaga, satu contoh utama bawaan);
- RPC `report_template_set_primary`;
- RPC galeri `report_template_gallery` / `report_dev_gallery` (ikut mengirim
  layout agar contoh bisa dirender);
- `report_template_save`, `report_template_save_layout`,
  `report_template_duplicate`, `report_template_set_active` diperluas ke
  **ADMIN + KOORDINATOR + USTADZ** untuk template milik lembaganya sendiri
  (tetap tenant-scoped, diverifikasi ulang di RPC);
- template global tetap milik DEVELOPER;
- hapus template tetap kewenangan ADMIN; raport utama tidak bisa
  dinonaktifkan atau dihapus sebelum ada penggantinya.

Route builder baru: `/koordinator/raport/builder/[templateId]` dan
`/ustadz/raport/builder/[templateId]`.

## Setelah menerima file
Container pembuat berkas ini tanpa `node_modules` dan tanpa jaringan, jadi
build belum dijalankan. Disarankan:

```bash
bun install        # atau npm install
npm run db:check   # validasi migrasi terhadap Postgres (PGlite)
npm run build
```
