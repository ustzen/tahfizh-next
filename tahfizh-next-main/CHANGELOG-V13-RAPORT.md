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

---

# V13.1 — Template bawaan "Raport 2 Kolom Modern"

Migrasi: `supabase/migrations/20260920210000_tahfizh_v13_template_2kolom_modern.sql`

Satu halaman A4 portrait, 31 komponen:

- **Kop gelap penuh** (navy `#0f2b5b`) berisi logo, nama lembaga, alamat,
  kontak, dan judul raport berwarna emas — ditutup strip aksen `#f59e0b`.
- **Kartu identitas santri** di bawah kop: identitas di kiri, tahun ajaran,
  semester, dan periode rata kanan.
- **Kolom kiri:** kartu Rekapitulasi Nilai (tahfidz, tartil, setoran, hadits,
  doa, tajwid) dan kartu Rekap Presensi.
- **Kolom kanan:** kartu Capaian Periode Ini, kartu Keterangan Predikat, dan
  kartu Catatan & Saran Guru bernuansa kuning.
- **Kaki halaman:** garis pemisah, tanda tangan guru & kepala lembaga, lalu
  pita navy berisi footer lembaga.

Template ini menjadi contoh utama bawaan platform, menggantikan "Raport 2
Kolom". Alur pemakaiannya: **Pakai Contoh Ini** → salinan masuk ke Template
Lembaga → ubah di **Report Builder** → **Jadikan Raport Utama**. Salinan
lembaga berdiri sendiri, jadi perubahan template global tidak pernah menarik
raport yang sudah dipakai.

### Perbaikan renderer
`component-content.tsx` kini menghormati `style.align` untuk komponen satu
baris (nama lembaga, alamat, kontak, judul, periode, tahun ajaran, semester,
footer). Sebelumnya komponen-komponen itu selalu tampil rata tengah karena
dirender sebagai flex container, sehingga pilihan rata kiri/kanan di builder
tidak berpengaruh.

---

# V14 — Import Santri: cocokkan halaqah berdasarkan NAMA, bukan kode

## Masalah
Kolom G pada file import santri sebelumnya harus diisi **kode** halaqah
(mis. `H-1`) yang dicocokkan persis (setelah di-uppercase) ke
`halaqahs.business_code`. Lembaga lebih sering menulis **nama** halaqah
(mis. "Alif"), sehingga baris tersebut gagal tertaut dan mendapat catatan
"Kode halaqah tidak ditemukan".

## Perubahan
- Kolom G kini disebut **Nama Halaqah/Kelas** dan dicocokkan ke
  `halaqahs.name`, **tidak peka huruf besar/kecil**: nilai `ALIF`, `Alif`,
  dan `alif` pada file semuanya tertaut ke halaqah bernama "Alif".
- `src/lib/import-shared.ts` — `ValidStudentRow.halaqahCode` → `halaqahName`
  (nilai dipertahankan apa adanya dari file, tidak di-uppercase); label
  kolom G untuk santri diubah jadi "Nama Halaqah/Kelas". Alias header
  ditambah `namahalaqah`, `namahalaqahkelas`, `halaqahname` agar variasi
  judul kolom tetap terdeteksi otomatis.
- `src/app/actions/import-export.ts` — resolusi halaqah kini mengambil semua
  `{id, name}` halaqah lembaga lalu mencocokkan dengan `.trim().toLowerCase()`
  di kedua sisi, menggantikan pencarian `.in("business_code", …)`. Pesan
  peringatan diperbarui menjadi `Halaqah "..." tidak ditemukan`.
- `src/app/koordinator/guru-santri/manager.tsx` — `halaqahHint` yang dikirim
  ke dialog import kini berisi daftar **nama** halaqah (dulu kode), dipakai
  sebagai contoh isian kolom G pada file contoh yang diunduh dan pada
  catatan bantuan di dialog.
- `src/app/koordinator/guru-santri/import-export.tsx` — teks bantuan dialog
  import santri diperbarui untuk menjelaskan pencocokan tanpa peka huruf
  besar/kecil.
- Import GURU tidak berubah — kolom G pada import guru memang belum
  diproses (tetap menampilkan catatan "atur penugasan guru lewat menu
  Halaqah").

## Tidak berubah
Perilaku saat nama halaqah kosong atau tidak ditemukan tetap sama: santri
tetap terimport tanpa halaqah, ditandai sebagai catatan (warning), dan bisa
diatur manual belakangan.

---

# V15 — Halaman Infak Santri: empty state diperbaiki

## Masalah
Saat data invoice infak wali tidak tersedia (akun wali belum ditautkan ke
data santri), halaman `/santri/infak` hanya menampilkan satu baris teks
polos di kotak putih kosong — tidak informatif dan terasa seperti bug.

## Perubahan
`src/app/santri/infak/page.tsx` — cabang "data tidak tersedia" ditulis ulang
menjadi:
- **Empty state utama** (memakai komponen `Empty`/`EmptyHeader`/`EmptyMedia`/
  `EmptyTitle`/`EmptyDescription` yang sama dipakai di halaman lain seperti
  Data Guru/Santri) dengan ikon `Link2Off`, judul yang menjelaskan akar
  masalah ("Akun Anda belum terhubung dengan data santri"), dan deskripsi
  singkat.
- **Tiga kartu langkah** di bawahnya: (1) hubungi admin/koordinator,
  (2) admin menautkan akun lewat menu Data Santri, (3) tagihan & riwayat
  infak langsung tampil setelah tertaut — supaya wali tahu persis apa yang
  harus dilakukan, bukan sekadar diberi tahu ada yang kosong.

Tidak ada perubahan pada logika data (`getWaliInvoices`, RPC
`payment_wali_invoices`) — perbaikan ini murni pada kualitas tampilan saat
kondisi tersebut terjadi.

---

# V16 — Perbaikan akar masalah: akun santri tidak pernah tertaut sebagai wali

## Koreksi atas V15
V15 menambahkan empty-state yang bagus tapi **salah menjelaskan masalahnya** —
seolah-olah perlu langkah manual "hubungi admin untuk menautkan akun". Itu
keliru: akun santri memang sudah tertaut ke data santrinya sendiri lewat
`students.login_username`. Yang salah bukan akunnya, tapi sistemnya.

## Akar masalah sesungguhnya
Menu Infak Pengembangan, halaman "Data Saya" (`/santri/anak`), dan dasbor
`/santri` semuanya membaca data lewat tabel `guardians` + `guardian_students`
(mekanisme wali). Setelah ditelusuri ke seluruh kode — pembuatan santri
manual, import Excel, maupun seed data dummy — **tidak ada satu jalur pun**
yang pernah menulis ke dua tabel itu. Akibatnya SETIAP akun santri di
seluruh lembaga selalu tampil "belum terhubung", bukan cuma kasus tertentu.

## Perbaikan
Migrasi `supabase/migrations/20260920220000_tahfizh_v16_santri_self_guardian_link.sql`:

1. **Trigger** `students_self_guardian_link_trg` pada `public.students` —
   begitu `login_username` terisi/berubah, akun (`profiles`, role
   `WALI_SANTRI`) dengan username yang sama otomatis dijadikan "wali dari
   dirinya sendiri": baris `guardians` + `guardian_students` dibuat otomatis.
   Berlaku untuk SEMUA jalur penulisan `login_username` (buat manual, import,
   seed) tanpa perlu mengubah kode aplikasi di masing-masing tempat.
2. **Backfill** satu kali untuk santri yang sudah punya akun sebelum migrasi
   ini ada — termasuk akun yang sedang dipakai sekarang.

## Perubahan lain
- `src/lib/account.ts` — komentar penjelas di `createLoginAccount` agar
  developer berikutnya tahu penautan wali-diri ditangani trigger DB, bukan
  kode di sini.
- `src/app/santri/infak/page.tsx` — empty-state diubah: bukan lagi
  "hubungi admin untuk menautkan", melainkan "ini seharusnya otomatis,
  kemungkinan gangguan sementara — muat ulang atau hubungi Admin/Developer",
  karena setelah V16 kondisi ini seharusnya nyaris tidak pernah terjadi untuk
  akun yang sah.
- `src/app/santri/anak/page.tsx` — komentar & teks empty-state yang sama
  diperbaiki (sebelumnya menyebut "penautan hanya dilakukan admin lembaga",
  padahal sekarang otomatis lewat trigger).

## Dampak
Setelah migrasi ini dijalankan, seluruh santri yang sudah punya akun login —
lama maupun baru — akan langsung melihat tagihan Infak Pengembangan, "Data
Saya", dan ringkasan di dasbor mereka, tanpa langkah admin apa pun.
