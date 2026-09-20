# TAHFIZH V1 + V2 + V3 + V4

Platform pengelolaan tahfizh untuk sekolah, TPQ, rumah tahfizh, madrasah, dan lembaga Al-Qur'an.
**Gratis untuk lembaga** — pengembangan didukung infak wali santri (mulai Rp1.000/bulan; modul infak menyusul di V2+).

Stack: **Next.js (App Router) · Supabase (Auth + Postgres + RLS) · Tailwind CSS v4 · shadcn/ui · TypeScript**.

---

## 1. Struktur Folder

```
src/
  app/
    page.tsx                    # Landing page (hero + login form, fitur, FAQ, dst.)
    (auth)/
      masuk/                    # Login
      daftar/                   # Pendaftaran lembaga (GRATIS)
      lupa-password/            # Kirim link reset
      reset-password/           # Buat password baru
    developer/                  # Dashboard + Lembaga (platform)
    admin/                      # Dashboard + Pengguna (tenant)
    koordinator/                # Dashboard + Guru & Santri (tenant)
    ustadz/                     # Dashboard + Santri binaan (tenant)
    wali/                       # Dashboard + Anak (tenant)
    actions/                    # Server actions (auth, register, crud, password)
  components/
    ui/                         # shadcn/ui primitives
    dashboard/                  # Shell, sidebar, header (nested layout)
    landing/                    # Bagian landing page
  lib/
    supabase/{client,server,admin}.ts   # Browser / RSC+actions / service-role
    auth.ts                     # Session + requireRole (server-side)
    roles.ts                    # Role, menu, label, ROLE_HOME
    cache.ts                    # Tenant-aware revalidation helpers
  middleware.ts                 # Session refresh + role guard per path
supabase/
  migrations/20260915000000_tahfizh_v1_init.sql  # Schema + business IDs + RLS
  seed.ts                       # Seed DEVELOPER (eksplisit, tidak otomatis)
  config.toml                   # Supabase local config
  templates/                    # Email template (recovery/invite/signup)
```

## 2. Database & Multi-Tenant

| Tabel | Isi | Isolasi |
| --- | --- | --- |
| `tenants` | Lembaga (ID bisnis `T-101…`) | RLS: DEVELOPER lihat semua; lainnya hanya tenant sendiri |
| `profiles` | 1:1 `auth.users`; **role + tenant_id hanya di sini** | RLS per tenant; self-escalation diblokir trigger |
| `teachers` | Guru (ID bisnis `A-1…`) | `tenant_id` + RLS |
| `students` | Santri (ID bisnis `S-1…`) | `tenant_id` + RLS |
| `guardians` | Wali (link ke profile) | RLS |
| `guardian_students` | wali ↔ anak (banyak-ke-banyak) | RLS |
| `teacher_students` | guru ↔ santri (banyak-ke-banyak) | RLS |
| `id_counters` | Counter ID bisnis global | Tidak ada akses klien (service role only) |

**Isolasi tenant ditegakkan di database** via Row Level Security. Kueri apa pun — bahkan lewat API
langsung ke Supabase — otomatis dibatasi ke `tenant_id` milik user yang login. `tenant_id`/role yang
dikirim dari browser tidak pernah dipercaya; semuanya dibaca dari `profiles` di server.

## 3. ID Bisnis (T-101, A-1, S-1)

- UUID = primary key internal; ID bisnis = kolom unik `business_code`.
- Counter **global** (`id_counters`) dialokasikan dengan `SELECT … FOR UPDATE` di dalam transaksi
  insert (function `next_business_id`) → aman dari race condition, tidak pakai `COUNT(*)`.
- Nomor terus berlanjut antar lembaga: guru T-101 dapat A-1, A-2; guru T-102 lanjut A-3, dst.

## 4. Role & Permission

| Role | Menu | Cakupan |
| --- | --- | --- |
| DEVELOPER | Dashboard, Lembaga | Semua tenant (platform) |
| ADMIN | Dashboard, Pengguna | Tenant sendiri |
| KOORDINATOR | Dashboard, Guru & Santri | Tenant sendiri |
| USTADZ | Dashboard, Santri | Hanya santri yang ditugaskan kepadanya |
| WALI_SANTRI | Dashboard, Anak | Hanya anak yang terhubung dengannya |

Pendaftar lembaga otomatis menjadi **ADMIN** (rule #15) — ditangani server action dengan
service-role, lalu profil dibuat via klien RLS agar kebijakan tetap diverifikasi.

## 5. Performance, Cache & Navigasi

- **Navigasi terasa seperti tab**: sidebar/header adalah nested layout yang tidak ikut re-mount saat
  pindah menu; hanya konten berganti (client-side navigation + `Link`).
- **Prefetch selektif**: `SidebarNav` mem-prefetch rute saudara dalam role yang sama saja (bukan
  seluruh aplikasi).
- **Loading**: skeleton hanya pada area data (`loading.tsx`), sidebar & header tetap tampil.
- **Cache invalidation**: setiap CREATE/UPDATE/DELETE memanggil `revalidatePath` per segmen role
  (helper `revalidateTenantPaths`) sehingga daftar & statistik selalu segar.
- **Tenant-aware**: revalidasi selalu konteks per-role/per-tenant; tidak ada cache bersama lintas
  tenant. Data sensitif (sesi/izin) tidak pernah di-cache.

## 6. Environment Variables

Salin `.env.example` → `.env.local`, isi dari dashboard Supabase (Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-side only, JANGAN pernah ke browser
```

> `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di server actions (buat auth user saat
> pendaftaran/kelola pengguna, toggle status lembaga oleh Developer) dan di seed script.

## 7. Menjalankan

```bash
bun install
bun run dev          # http://localhost:3000
```

### Setup Supabase

1. Buat project di [supabase.com](https://supabase.com) (atau `supabase start` untuk lokal).
2. Jalankan migrasi:
   ```bash
   supabase db push          # CLI
   # atau paste isi supabase/migrations/20260915000000_tahfizh_v1_init.sql
   # ke SQL Editor di dashboard
   ```
3. Isi `.env.local`, restart dev server.

### Seed (eksplisit, tidak otomatis)

```bash
# a. buat user auth via dashboard Supabase (Authentication → Users → Add user),
#    lalu:
bun supabase/seed.ts <USER-UUID>

# atau langsung buat user-nya:
bun supabase/seed.ts --email dev@tahfizh.app
```

Seed hanya membuat profil **DEVELOPER** (tanpa data demo palsu di production).

## 8. Route Aplikasi

| Route | Akses |
| --- | --- |
| `/` | Landing page (login form langsung di hero) |
| `/masuk`, `/daftar`, `/lupa-password`, `/reset-password` | Publik/auth |
| `/developer`, `/developer/lembaga`, `/developer/lembaga/[id]` | DEVELOPER |
| `/admin`, `/admin/pengguna` | ADMIN |
| `/koordinator`, `/koordinator/guru-santri` | KOORDINATOR |
| `/ustadz`, `/ustadz/santri` | USTADZ |
| `/wali`, `/wali/anak` | WALI_SANTRI |

Middleware melindungi seluruh segmen role: belum login → `/masuk?returnTo=…`; salah role →
dialihkan ke home role-nya.

## 9. Testing (checklist rule #49)

Alur yang diuji manual mengikuti prompt V1 (register T-101 → admin otomatis → buat koordinator →
guru/santri → relasi → ustadz hanya lihat binaan → wali hanya lihat anak → register T-102 → data
tidak bocor antar tenant → logout/reset password/remember me → build).

Catatan verifikasi build & typecheck: `bun run build` dan `bun tsc --noEmit`.

## 11. V2 — Pengaturan & Profil (baru)

V2 menambahkan satu menu **Pengaturan** untuk semua role (isi menyesuaikan hak akses) di atas fondasi V1 yang tidak berubah.

### Fitur

| Bagian | Siapa | Isi |
| --- | --- | --- |
| Profil | Semua role | Foto (Supabase Storage), nama, gelar depan/belakang, nomor WhatsApp |
| Keamanan | Semua role | Ganti email (konfirmasi via Supabase Auth) + ganti password (password lama, show/hide) |
| Tampilan/Menu | Semua role | Urutan menu per-user (drag-and-drop ringan) + "Kembalikan ke Urutan Default" |
| Terminologi | ADMIN | Custom label istilah lembaga (Santri→Murid, dst.) dengan preview sebelum simpan |
| Identitas Lembaga | ADMIN | Jenis identitas guru yang dipakai lembaga (NIP/NBM/NUPTK/NIY/custom) + tampilkan di dokumen |
| Pimpinan | ADMIN | Nama, gelar depan/belakang, jenis + nomor identitas kepala sekolah (persiapan raport) |

### Struktur baru

```
supabase/migrations/20260915010000_tahfizh_v2_settings.sql
src/lib/{terminology,terminology-shared,identity,layout-data}.ts
src/app/actions/{profile,settings}.ts
src/components/settings/*            # SettingsLayout + form per bagian
src/app/<role>/pengaturan/…          # profil, keamanan, menu (+ terminologi, identitas, pimpinan utk ADMIN)
```

### Tabel V2 (semua ber-RLS dan tenant-aware)

| Tabel | Isi |
| --- | --- |
| `user_profiles` | avatar_path, gelar depan/belakang (1:1 profiles) |
| `teacher_identities` | Nomor identitas guru per jenis (JSONB + validasi) |
| `identity_types` | Konfigurasi jenis identitas lembaga (nama custom, prefix, urutan) |
| `tenant_settings` | show_teacher_identity_on_docs, dst. |
| `terminologies` | Label istilah custom per tenant (JSONB; kosong = default) |
| `leader_settings` | Data kepala sekolah/pimpinan per tenant |
| `user_menu_preferences` | Urutan menu per user (JSONB array) |
| `settings_audit_log` | Siapa/kapan/apa yang mengubah konfigurasi tenant |
| Storage: `bucket avatars` | `avatars/{userId}/…`, policy: hanya pemilik yang baca/tulis |

### Terminologi (rule #38)

Terminologi **hanya mengubah label UI** — nama tabel/kolom database tidak pernah diubah.
Label di-resolve di server (`getTerminology`, cached per-request via React `cache`) dan di-
validasi terhadap `TERMINOLOGY_KEYS`. Tanpa kustomisasi → default TAHFIZH dipakai.

### Cache V2 (tenant-aware)

- `tenant:{tenantId}:terminology` — invalidate saat admin menyimpan terminologi.
- `profile:{userId}` — invalidate saat profil/avatar berubah.
- `user:{userId}:menu-order` — invalidate saat urutan menu disimpan/reset.
- Audit ditulis pada setiap perubahan konfigurasi tenant.

### Jalankan migrasi V2

```bash
supabase db push
# atau paste supabase/migrations/20260915010000_tahfizh_v2_settings.sql
# ke SQL Editor (setelah migrasi V1)
```

## 13. V3 — Modul Tahfidz (baru)

Guru mencatat dan menilai perkembangan hafalan santri; Admin mengonfigurasi master surat dan mode penilaian — semuanya per lembaga (tenant).

### Menu

- **USTADZ/USTADZAH**: menu utama baru **Tahfidz** (daftar santri binaan → detail → penilaian).
- **ADMIN**: konfigurasi lewat **Pengaturan → Tahfidz** (bukan menu utama).
- Role lain: tidak ada menu Tahfidz pada V3.

### Struktur baru

```
supabase/migrations/20260915020000_tahfizh_v3_tahfidz.sql
src/lib/tahfidz.ts                       # Server-only data access (tenant-scoped)
src/app/actions/tahfidz.ts               # Guru: single + bulk assessment (RPC)
src/app/actions/tahfidz-admin.ts         # Admin: surah CRUD/reorder, grades, konversi
src/app/ustadz/tahfidz/                  # Daftar + [studentId] detail + form/riwayat
src/app/admin/pengaturan/tahfidz/        # Master surat, mode, grade, konversi
src/components/settings/{surah-manager,mode-switcher,grade-config-form,global-master-source,tahfidz-section}.tsx
```

### Tabel V3 (semua ber-RLS, tenant-aware)

| Tabel | Isi |
| --- | --- |
| `tahfidz_surahs` | MASTER GLOBAL (seed Juz 30, An-Nas → An-Naba'). Baca-only untuk klien; platform yang mengelola |
| `tahfidz_tenant_surahs` | Surat yang dipakai lembaga: pilih dari master, override nama, urutan, aktif/nonaktif + surat custom (`surah_id null`) |
| `tahfidz_settings` | Mode penilaian lembaga: CENTANG / HURUF / ANGKA |
| `tahfidz_grade_settings` | Konfigurasi grade HURUF: label + rentang min–maks (tidak hard-coded) |
| `tahfidz_assessments` | Nilai saat ini per santri+surat (status BELUM/DIPELAJARI/DINILAI, skor, catatan, guru penilai) |
| `tahfidz_assessment_history` | Append-only (trigger): setiap create/update/konversi tercatat + `mode_at_entry` |
| `tahfidz_mode_changes` | Audit konversi: siapa, kapan, mode lama→baru, metode, mapping |

### Keamanan

- Penilaian **hanya** lewat RPC `tahfidz_save_assessment` / `..._bulk`: guru diverifikasi dari session (bukan `teacher_id` dari client), santri wajib binaan guru tsb., surat wajib aktif, skor divalidasi sesuai mode.
- Tidak ada policy INSERT/UPDATE/DELETE langsung pada `tahfidz_assessments` untuk klien — defense in depth.
- RLS SELECT: guru hanya santri binaannya; Admin/Koordinator satu tenant; wali belum diberi akses (siap untuk V4+ via `guardian_students`).

### Master surat (rule #6-#11, #32-#33)

Global master di database (37 surat Juz 30, seed idempoten). Tenant memilih surat, boleh override nama (`name_override`), mengurutkan (drag-and-drop), menonaktifkan. Surat yang sudah memiliki penilaian **tidak bisa dihapus** (diblokir app + FK) — gunakan nonaktifkan agar histori utuh. Surat custom disimpan dengan `tenant_id`.

### Mode & konversi (rule #12-#22, #47-#50)

- 3 mode per tenant; grade HURUF dikonfigurasi Admin (label + rentang).
- Ganti mode dengan data lama → dialog **Konversi Nilai Diperlukan**: per-grade pilihan Nilai Bawah/Tengah/Atas/Custom; ✓ → angka/grade pilihan; status kosong tetap kosong; preview; konfirmasi.
- RPC `tahfidz_convert_grades` berjalan dalam **satu transaksi (ALL-OR-NOTHING)**: mapping tidak lengkap → error, tidak ada data berubah. Riwayat mencatat `change_kind='CONVERT'` + detail — nilai asli guru tidak pernah dimanipulasi diam-diam.

### Cache V3 (tenant-aware, rule #37-#38)

- `tenant:{code}:tahfidz-surahs` & `tenant:{code}:tahfidz-settings` — invalid saat Admin mengubah surah/mode/grade.
- `student:{id}:tahfidz-summary` — invalid saat guru menyimpan penilaian; ringkasan dihitung via RPC `tahfidz_teacher_summaries` (DISTINCT ON, tanpa memuat seluruh histori).

### Jalankan migrasi V3

```bash
supabase db push
# atau paste supabase/migrations/20260915020000_tahfizh_v3_tahfidz.sql
# ke SQL Editor (setelah migrasi V1 + V2)
```

## 15. V4 — Modul Tartil & Kartu Prestasi (baru)

Guru menyimak bacaan santri dan menilai kemampuan Tartil. **Sekali guru menilai → otomatis tercatat di Kartu Prestasi santri** — tanpa input ganda.

### Menu

- **USTADZ/USTADZAH**: menu utama baru **Tartil** (daftar binaan → detail → penilaian) dan **Kartu Prestasi** diakses dari detail Tahfidz/Tartil (`/ustadz/prestasi/[studentId]`).
- **ADMIN**: **Pengaturan → Tartil** — master materi + template catatan.
- Koordinator/Wali: belum ada akses Tartil (struktur siap untuk V5+).

### Struktur baru

```
supabase/migrations/20260915030000_tahfizh_v4_tartil.sql
src/lib/{tartil,tartil-shared,tartil-detail}.ts
src/app/actions/{tartil,tartil-admin}.ts
src/app/ustadz/tartil/                   # Daftar + [studentId] detail (form + histori)
src/app/ustadz/prestasi/[studentId]/     # Kartu Prestasi (timeline + filter)
src/app/admin/pengaturan/tartil/         # Materi + template
src/components/settings/{tartil-section,material-manager,template-manager}.tsx
```

### Tabel V4 (semua ber-RLS, tenant-aware)

| Tabel | Isi |
| --- | --- |
| `tartil_materials` | Master materi per lembaga (nama, jilid, halaman, keterangan, urutan, aktif). Seed otomatis: Iqra 1–6 + Al-Qur'an |
| `tartil_note_templates` | Template catatan terstruktur per lembaga: Apresiasi / Bacaan / Fashohah / Saran / Catatan Orang Tua |
| `tartil_assessments` | Penilaian: santri, guru, tanggal, materi, halaman, skor (mode V3), catatan bebas. Soft delete (`deleted_at`) |
| `tartil_assessment_notes` | Catatan terstruktur 1:N per penilaian (5 slot) |
| `tartil_assessment_history` | Append-only via trigger — snapshot lengkap termasuk catatan; tidak ada yang ditimpa |

### Kartu Prestasi (rule #17-#21)

Tidak ada tabel duplikat: timeline = RPC `tartil_student_timeline` yang menggabungkan histori Tartil **dan** histori Tahfidz V3 (filter: Semua/Tartil/Tahfidz). Setiap penilaian yang disimpan guru otomatis muncul. Module baru di masa depan cukup menambah UNION pada RPC ini.

### Penilaian (rule #11/#46)

Satu sumber konfigurasi: mode + grade **diambil dari `tahfidz_settings`/`tahfidz_grade_settings` V3** — tidak ada `tartil_grade_settings` terpisah. Centang ✓ / grade / angka 1–100 otomatis mengikuti lembaga.

### Keamanan

- Penilaian hanya via RPC `tartil_save_assessment` (create/edit milik guru sendiri) & `tartil_soft_delete_assessment`: session → role USTADZ → guru → santri binaan → materi aktif → validasi skor per mode.
- RLS: guru hanya santri binaannya; Admin/Koordinator baca tenant; wali belum; tidak ada write langsung klien.
- Error message ramah: "Penilaian belum berhasil disimpan…", form tetap terisi saat gagal, tombol "Menyimpan…" anti double-submit.

### Cache V4 (tenant-aware)

`tenant:{code}:tartil-materials`, `tenant:{code}:tartil-note-templates`, `student:{id}:tartil-summary`, `student:{id}:achievement-card` — di-invalidasi saat admin mengubah materi/template dan saat guru menyimpan/menghapus penilaian.

### Jalankan migrasi V4

```bash
supabase db push
# Seed materi+template default dijalankan otomatis untuk tenant baru;
# untuk tenant lama: select tartil_backfill_defaults(id) from tenants;
```

## 17. V5 — Modul Setoran (baru)

V5 menambahkan menu **Setoran** untuk USTADZ/USTADZAH: mencatat aktivitas santri menyetorkan hafalan (berbeda dari Tahfidz yang mencatat pencapaian). Semua fitur V1–V4 tetap utuh.

### Rute baru

- `/ustadz/setoran` — daftar santri binaan + setoran terakhir, pencarian nama/ID (S-1), tombol **Setoran Baru**.
- `/ustadz/setoran/[studentId]` — detail: form setoran + riwayat + filter (Semua/Hafalan Baru/Murojaah/Lulus/Perlu Mengulang/Ditunda via `?filter=`).
- `/admin/pengaturan/setoran` — Admin mengelola **template catatan Setoran** (tambah/edit/aktif-nonaktif/urut).

### Database (migration `20260915040000_tahfizh_v5_setoran.sql`)

| Tabel | Isi | RLS |
| --- | --- | --- |
| `tahfidz_submission_templates` | Template catatan 5 slot: Apresiasi, Kelancaran, Kesalahan, Saran, Catatan Orang Tua (seed otomatis per tenant) | select: tenant; write: ADMIN |
| `tahfidz_submissions` | Setoran: santri, guru, surat (FK ke master V3 — **tanpa master kedua**), jenis `HAFALAN_BARU`/`MUROJAAH`, ayat/bagian (teks fleksibel), tanggal, status `LULUS`/`PERLU_MENGULANG`/`DITUNDA`, skor mode V3, soft delete | select: guru→binaan saja; Admin/Koordinator baca; write hanya via RPC |
| `tahfidz_submission_notes` | Catatan terstruktur 1:N | ikut submission |
| `tahfidz_submission_history` | Append-only via trigger (`CREATE`/`UPDATE`/`SOFT_DELETE`) | pola guru sama |

### Aturan penting yang dipenuhi

- **Rule #9/#12** — surat & penilaian memakai konfigurasi V3 (satu sumber; tanpa `submission_grade_settings`).
- **Rule #19/#20** — Setoran otomatis muncul di **Kartu Prestasi**: RPC `tahfidz_student_timeline` (superset V4) kini meng-union histori SETORAN + filter baru "Setoran". Tidak ada input ganda, tanpa duplikasi data.
- **Rule #21** — setoran LULUS tidak pernah menimpa data Tahfidz V3 secara diam-diam; hubungan read-side (siap dijadikan sumber perkembangan di versi berikutnya).
- **Rule #49** — tanpa unique constraint (student+surat+tanggal); beberapa setoran/hari sah; double-submit dicegah di UI (tombol "Menyimpan…" disabled).
- **Rule #48** — simpan = satu transaksi via RPC `tahfidz_save_submission` (row + notes + history), validasi session→role→guru→binaan→surat aktif→mode/grade→tanggal (maks +7 hari/−1 tahun).

### Cache V5 (tenant-aware)

`tenant:{code}:submission-note-templates`, `student:{id}:submissions`, plus `student:{id}:achievement-card` (dibagikan dengan V4) — di-invalidasi saat admin mengubah template dan saat guru menyimpan/mengarsipkan setoran.

### Jalankan migrasi V5

```bash
supabase db push
# Seed template default dijalankan otomatis untuk tenant baru;
# backfill tenant lama sudah termasuk dalam migration V5 (idempoten).
```

## 18. V6 — Modul Hadits, Doa Harian & Tajwid (baru)

Migration: `supabase/migrations/20260915050000_tahfizh_v6_learning.sql`

Tiga modul pembelajaran baru dengan satu engine generik:

- **Master materi per tenant (ADMIN)** — `hadith_materials`, `daily_prayer_materials`,
  `tajwid_materials` (judul wajib; Arab/terjemahan/latin/kategori/penjelasan opsional;
  urutan + aktif/nonaktif). Kelola via **Pengaturan → Materi** (tab Hadits / Doa / Tajwid / Template).
  Materi yang sudah dipakai penilaian tidak bisa dihapus (hard delete diblokir) — nonaktifkan saja.
- **Template catatan reusable** — `learning_note_templates` dengan `module_type`
  (HADITS/DOA/TAJWID), slot per modul (mis. Pemahaman/Penerapan untuk Tajwid).
  Seed default otomatis; tenant lama: `select learning_backfill_defaults(id) from tenants;`
- **Penilaian** — `learning_assessments` (satu tabel, `module_type` + FK per modul dengan
  CHECK) + notes terstruktur + history append-only via trigger. Guru menilai **hanya via RPC**
  `learning_save_assessment` (verifikasi session→guru→relasi binaan→materi aktif tenant).
- **Mode penilaian & grade** = konfigurasi V3 (`tahfidz_settings`/`tahfidz_grade_settings`)
  — tanpa sistem penilaian kedua.
- **Kartu Prestasi** — RPC `tahfidz_student_timeline` diperluas ke superset 6 modul
  (Tahfidz/Tartil/Setoran/Hadits/Doa/Tajwid) + filter baru di UI. Zero input ganda.
- **Menu Ustadz** baru: `/ustadz/hadits`, `/ustadz/doa`, `/ustadz/tajwid` (+ detail per santri).
- **Dashboard guru**: kartu "Aktivitas Hari Ini" (Setoran/Tartil/Hadits/Doa/Tajwid — angka nyata
  via RPC `learning_teacher_today`).
- **Detail santri (tahfidz)**: ringkasan "Perkembangan Pembelajaran" per modul (rule #26).
- **RLS**: semua tabel baru tenant-isolated; baca guru dibatasi santri binaan; write master
  hanya ADMIN; write penilaian hanya via RPC SECURITY DEFINER.
- Cache: `tenant:{code}:hadits|doa|tajwid|learning-templates`, `student:{id}:hadits|doa|tajwid`,
  `student:{id}:achievement-card` — invalid saat materi/template berubah atau penilaian disimpan.

## 19. V7 — Modul Target, Tugas & Custom Jurnal (baru)

Migration: `supabase/migrations/20260915060000_tahfizh_v7_target_tugas_jurnal.sql`

Fitur untuk guru, satu engine generik (Target per santri sudah tidak ada sejak V17):

- **Target** — *dihapus di V17 dan diganti target per halaqah (lihat bagian V17 di akhir dokumen).*
- **Tugas** — `/ustadz/tugas`: judul + instruksi + deadline + modul (termasuk Custom). Status
  Belum Dikerjakan → Dikerjakan → Dikumpulkan → Dinilai / Terlambat dengan histori status.
  Penilaian **memakai engine V3** (Centang/Huruf/Angka — rule #20/#69). Hanya tugas DINILAI
  yang masuk Kartu Prestasi (rule #22 — tanpa noise administratif).
- **Custom Jurnal** — Admin membuat template dengan **field dinamis** (Teks/Angka/Pilihan/
  Checkbox/Tanggal/Teks Panjang, wajib/opsi) via Pengaturan → Custom Jurnal — struktur
  `journal_templates → journal_fields → journal_entries → journal_values` tanpa kolom baru per
  field (rule #39). Guru mengisi di `/ustadz/jurnal`, validasi field wajib + tipe di form DAN
  RPC. Template memiliki toggle **"Tampilkan di Kartu Prestasi"** (rule #31); hapus template
  terblokir bila sudah dipakai (soft-delete arsip).
- **Kartu Prestasi** — RPC `tahfidz_student_timeline` kini superset 8 modul (TAHFIDZ, TARTIL,
  SETORAN, HADITS, DOA, TAJWID, **TUGAS**, **JURNAL**) + filter baru di UI. Zero input ganda.
- **Dashboard guru** — widget Target halaqah aktif / Tugas aktif / Jurnal 30 hari (RPC `v7_teacher_counts`).
- **Detail santri** — ringkasan Tugas/Jurnal (RPC `v7_student_summary`) + CTA form dengan santri terpilih.
- **RLS**: semua tabel V7 tenant-isolated; guru hanya membaca santri binaan; write **hanya via
  RPC** (`task_save`, `task_set_status`,
  `journal_entry_save`, `journal_template_*` untuk ADMIN) yang memverifikasi session → role →
  tenant → guru → relasi binaan (rule #41-#42).
- Cache: `tenant:{code}:tasks|journal-templates`, `student:{id}:tasks|journals`,
  `student:{id}:achievement-card` — invalid saat guru/Admin menyimpan perubahan (rule #43/#44).

## 20. V9 — Raport Dinamis & Report Builder (baru)

Migration: `supabase/migrations/20260915080000_tahfizh_v9_raport.sql`

Prinsip: **satu data pembelajaran → banyak output** — guru tidak pernah mengetik ulang nilai
untuk raport (rule #29); semua nilai diambil batch via RPC `report_student_data` dari
Tahfidz/Tartil/Setoran/Hadits/Doa/Tajwid/Target/Tugas/Jurnal sesuai periode (rule #73).

- **Template** — Developer menyediakan 3 template global (1 Kolom, 2 Kolom, Fleksibel 2 Halaman,
  seeded). Admin lembaga **menginstansiasi salinan** (Pengaturan→Raport→Pakai Template) —
  perubahan Developer tidak pernah merusak raport lembaga (rule #5). Setiap simpan membuat
  **versi baru** (`report_template_versions`, rule #43).
- **Report Builder** — `/admin/raport/builder/[templateId]`: canvas WYSIWYG per halaman dengan
  drag, resize (handle kanan-bawah), **snap grid 8px** (rule #10), kunci posisi (rule #11),
  tampil/sembunyi (rule #12), property panel (posisi/ukuran/font/bold/italic/align/opasitas/teks),
  **undo/redo** (Ctrl+Z/Ctrl+Shift+Z), **Ctrl+S**, manajemen halaman (tambah/duplikat/hapus/urutkan,
  rule #58/#59). Simpan **hanya via tombol Simpan** — tanpa request per drag (rule #54/#55).
  18 komponen bawaan + Teks Bebas; arsitektur terbuka untuk komponen Developer berikutnya (rule #14).
- **Data binding** — komponen mengambil data hidup: identitas santri/guru (ID sesuai setting V2
  `show_teacher_identity`, rule #17), kepala lembaga (V2 `leader_profiles`), tabel nilai per mode
  **engine V3** (Centang/Huruf/Angka, rule #26/#27), Kartu Prestasi ringkas, footer. Presensi
  dirender placeholder sampai modul V8 tersedia — tanpa angka dummy.
- **Identitas & aset** — Pengaturan→Raport: alamat, kontak, footer, logo, watermark
  (opacity 10–30% default halus, ukuran, rule #21/#22). Logo/watermark disimpan di bucket privat
  `report-assets` dengan path `{tenant_id}/...` + storage RLS per tenant (rule #19/#45/#69).
- **Siklus raport** — Draft (nilai hidup) → **Final** (snapshot `report_snapshots` yang tidak
  berubah, rule #31/#67) → Buka Kembali untuk revisi. Preview menyerupai cetak; **Cetak/PDF**
  via pipeline `@media print` yang mengisolasi `.report-page` (ukuran & posisi persis builder,
  rule #35/#36/#57). A4/A5/Letter × Portrait/Landscape (rule #37/#38).
- **Peran** — Developer: template global + builder; Admin: pilih/salin/edit template, buat &
  finalkan raport, pengaturan; Koordinator: daftar + preview (read-only, rule #50); Guru: daftar
  + preview raport binaan (rule #51); Wali: belum ada.
- **RLS & RPC** — semua tabel V9 tenant-isolated; write template/raport **hanya via RPC**
  SECURITY DEFINER (`report_template_save/_save_layout/_duplicate/_set_active/_delete`,
  `report_settings_save`, `report_create/_finalize/_reopen/_delete`) yang memverifikasi
  session → role → tenant → ownership (rule #47). Template global terbaca semua user
  authenticated; template tenant hanya lembaganya.
- **Cache** — `report-templates` tag global, `tenant:{code}:report-settings`,
  `student:{id}:reports` — invalid saat template/pengaturan/raport berubah; **snapshot final
  tidak pernah di-cache sebagai sumber kebenaran** (rule #71).
- Checklist test §75–§87: template→salinan→edit (global tak berubah), drag/resize persist,
  watermark 20%, ID guru Ya/Tidak, final→ubah data→snapshot tak berubah, isolasi T-101↔T-102.

## 21. V8 — Modul Halaqah & Presensi (baru)

Migration: `supabase/migrations/20260915100000_tahfizh_v8_halaqah_presensi.sql`

Struktur: **Lembaga → Halaqah → Guru Pengampu → Santri** dan **Halaqah → Presensi → Rekap**.
Terminologi mengikuti engine V2 (Halaqah/Kelas/Kelompok/Rombel — rule #3); penamaan tabel tetap teknis.

- **Halaqah** — `/admin/halaqah`: CRUD + aktif/nonaktif + guru pengampu (N guru, satu utama — rule #8)
  + anggota (rule #9). Kode otomatis global `H-1, H-2, ...` (rule #48). Hapus hanya jika belum dipakai
  (anggota/presensi) — selain itu nonaktifkan (histori aman).
- **Histori & pindah halaqah** — `halaqah_students` = tabel relasi dengan `joined_at`/`left_at`: baris
  aktif = halaqah sekarang, baris lama tetap tersimpan saat santri pindah (rule #10/#11). Presensi &
  data pembelajaran lama TIDAK berubah — record presensi menyimpan `halaqah_id` konteks saat dibuat
  (rule #49). Histori tampil di tab Aktivitas.
- **Quick Attendance (rule #13-#26)** — `/ustadz/presensi`: tombol massal **[H][I][S][A]** mengubah
  seluruh santri di CLIENT STATE (rule #20 — nol request per klik), override per-santri dengan chip
  H/I/S/A besar (min-h 44px, mobile-first rule #54), catatan opsional per santri + catatan pertemuan
  (rule #28-#30), strip ringkasan Hadir/Izin/Sakit/Alpa sebelum simpan (rule #25), tanggal default
  hari ini (rule #31). **[Simpan Presensi] = SATU batch call** (`attendance_save_batch` upsert sesi +
  semua record dalam satu transaksi — 30 santri = 1 request, rule #21). Buka ulang tanggal yang sama
  memuat data tersimpan — tidak ada duplikat (unique session+student, rule #33/#68).
- **Rekap (rule #35-#37)** — per santri (H/I/S/A + persentase) dengan filter Hari/Minggu/Bulan/Custom
  (default bulan berjalan, URL-driven tanpa reload). Tersedia untuk Guru (`/ustadz/presensi/rekap`),
  dan per-halaqah di detail Admin/Koordinator. **Kehadiran** per santri (rule #38) tampil di detail
  tahfidz + menulis `attendance_student_summary` untuk raport (rule #62).
- **Histori (rule #59)** — `attendance_history` append-only via trigger: old_status → new_status,
  changed_by, changed_at. Sesi menyimpan created_by/updated_by + waktu (rule #32).
- **Peran** — Admin: CRUD + lihat presensi/rekap (read-only); Koordinator: lihat semua + presensi/rekap
  (read-only, tanpa supervisi rule #61); Guru: halaqah diampu + presensi + histori + rekap; Wali:
  belum ada UI V8.
- **RLS** — semua 6 tabel tenant-isolated; guru hanya melihat halaqah yang diampu; write presensi
  hanya via RPC yang memverifikasi session → role → tenant → keanggotaan aktif → relasi pengampu
  (rule #45-#47). Cache tenant-aware `tenant:{code}:halaqah`, `halaqah:{id}:students|attendance`,
  `student:{id}:attendance` + invalidasi saat CRUD/anggota/pindah/simpan presensi (rule #50/#51).
- **Integrasi V9** — RPC `report_student_data` kini mengambil rekap presensi asli; komponen raport
  ATTENDANCE menampilkan Hadir/Izin/Sakit/Alpa + persentase (bukan placeholder).
- Checklist test §63-§75 ada di bawah (quick H→S override, tanpa duplikat, isolasi T-101↔T-102,
  terminologi per tenant, aksesibilitas H/I/S/A dengan label + huruf).

## 22. V10 — Infak Pengembangan, Pembayaran, WhatsApp, Kritik & Saran (baru)

Migration: `supabase/migrations/20260915110000_tahfizh_v10_infak_whatsapp_feedback.sql`
(tabel `payment_settings`, `payment_invoices`, `payment_transactions`, `payment_allocations`,
`payment_webhooks`, `feedback`, `notifications`, kolom `halaqahs.whatsapp_group_url`,
bucket storage `payment-proofs`, ±35 RPC security definer + RLS tenant-isolated).

- **Infak Pengembangan (rule #3-#4)** — bukan langganan. Gratis untuk lembaga; wali santri
  memberi infak mulai Rp1.000/bulan/santri. Tagihan muncul tanggal 1 untuk semua santri aktif di
  semua lembaga (lihat bagian di bawah), batas pembayaran maksimal tanggal 15.
- **Pembatasan akses wali (rule #7-#11)** — mulai tanggal 16, wali dengan tagihan bulan berjalan
  belum terkonfirmasi diarahkan ke `/wali/infak` (enforcement di `src/proxy.ts` via
  `wali_payment_gate()`). Admin/Koordinator/Guru/Developer tidak pernah terkunci. Akses terbuka
  otomatis setelah pembayaran terkonfirmasi.
- **Pembayaran manual** — wali memilih tagihan (multi-santri, multi-bulan), nominal ≥ tagihan
  (`payment_initiate` memvalidasi ulang semuanya di server), transfer ke rekening lembaga,
  unggah bukti (storage private, path `{tenant}/proof-{tx}`), Developer konfirmasi/tolak
  dengan alasan (`payment_dev_confirm`, atomik + notifikasi).
- **Pembayaran otomatis (iPaymu)** — minimal Rp10.000. Redirect hosted checkout
  (`src/lib/ipaymu.ts`, HMAC-SHA256 signature), webhook `/api/webhooks/ipaymu` idempoten
  (tabel `payment_webhooks` + signature check) → `payment_mark_paid_auto` atomik/lunas per
  bulan. Set env: `IPAYMU_VA`, `IPAYMU_API_KEY`, `IPAYMU_ENV=sandbox|production`.
- **Bayar untuk santri lain (rule #24-#28)** — wali dapat mencentang santri lain di lembaga yang
  menunggak dan membayarkannya (diurutkan dari yang paling lama menunggak); santri yang dibayarkan
  melihat siapa pembayarnya. Rincian di bagian "Bayarkan Santri Lain, Beberapa Bulan, Riwayat per
  Bulan" di bawah.
- **Beberapa bulan sekaligus** — alokasi per invoice (`payment_allocations`), satu transaksi
  bisa menutup beberapa bulan/santri; pelunasan per bulan (rule #38). Bisa juga bayar di muka.
- **Developer** *(dipindah dari Admin — lihat bagian "Infak Pengembangan di Dasbor Developer")* —
  `/developer/infak` (ringkasan semua lembaga + antrean konfirmasi + buat tagihan),
  `/developer/infak/transaksi` (filter status + pencarian), detail transaksi dengan bukti + keputusan,
  `/developer/infak/pengaturan` (nominal default, rekening, QRIS, instruksi, catatan konfirmasi).
- **WhatsApp (rule #40-#43)** — tanpa WhatsApp API: guru melihat daftar wali santri binaan
  (`v10_teacher_whatsapp_directory`) dengan tombol wa.me (nomor dinormalisasi 08→62);
  admin mengatur tautan grup WhatsApp per halaqah.
- **Kritik & Saran (rule #45-#58)** — form untuk semua role: kategori (Kritik/Saran/Laporan
  Error/Permintaan Fitur/Pengembangan/Lainnya), tujuan (Ustadz/Koordinator/Admin/Lembaga/
  Developer), opsional anonim. Laporan error otomatis menyertakan URL halaman. Visibility:
  pengirim selalu melihat miliknya; ADMIN mengelola masukan lembaga (bisa teruskan), KOORDINATOR
  melihat masukan koordinator+guru, USTADZ melihat masukan untuknya, DEVELOPER melihat semua
  masukan DEVELOPER dengan identitas asli (meski anonim).
- **Notifikasi (rule #59-#60)** — lonceng di header semua role: PAYMENT_SUBMITTED/CONFIRMED/
  REJECTED, FEEDBACK_NEW, INFO; tandai satu/semua dibaca (`notification_*`).
- **Audit & keamanan** — snapshot `payer_name`, webhook log, RLS semua tabel, RPC memverifikasi
  session → role → tenant; wali hanya membaca tagihan anaknya sendiri.

## 23. V11 — Akademik: Tahun Ajaran, Jadwal, Onboarding, Mutasi, Riwayat Perkembangan (baru)

Migration: `supabase/migrations/20260915120000_tahfizh_v11_akademik.sql`
(tabel `academic_years`, `academic_semesters`, `learning_settings`, `learning_schedules`,
`student_enrollments`, `student_transfers`, `student_promotions`, `student_status_history`,
view `student_development_events` di atas data V3–V8, `onboarding_progress`; ±20 RPC security
definer + RLS tenant-isolated + index #72).

- **Auth (#1-#3)** — lupa password → `/lupa-password` → Supabase recovery email →
  `/reset-password` (validasi min 8 char + konfirmasi sama, toggle tampil/sembunyi).
  Verifikasi email: pendaftaran menampilkan "Silakan periksa email Anda", halaman
  `/verifikasi-email` dengan tombol kirim ulang (`auth.resend`, alamat dari session saja).
  Gate email belum terverifikasi di `src/proxy.ts`. Edit profil memakai `auth.updateUser({email})`
  — email baru harus dikonfirmasi sebelum berlaku.
- **Tahun ajaran & semester (#4-#12)** — per tenant; hanya SATU tahun aktif (mengaktifkan tahun
  lain otomatis mengarsipkan sebelumnya, RPC atomik), hanya satu semester aktif di tahun aktif.
  Tanggal semester dapat diedit (#6). Arsip, bukan hapus (#9); data tahun lama tidak pernah berubah.
- **Jadwal (#13-#16)** — checkbox hari pembelajaran per lembaga (`learning_settings`), jadwal per
  halaqah (hari/jam/ruang, `learning_schedules`). Referensi saja — presensi V8 tidak berubah.
- **Onboarding (#17-#28)** — wizard 10 langkah di `/admin/onboarding`: Profil → Terminologi →
  Tahun Ajaran → Jadwal → Guru → Santri → Halaqah → Raport → Infak → Selesai. Setiap langkah
  dapat dilewati/ditandai; progres tersimpan di `onboarding_progress` dan tetap ada setelah login
  ulang (#82). Banner pengingat di dashboard admin sampai selesai/ditutup. Langkah 5-9
  menautkan ke pengaturan existing (tanpa duplikasi #25/#26).
- **Mutasi & status (#29-#42)** — `/admin/akademik/mutasi`: pindah halaqah (ID santri tetap,
  histori `halaqah_students` + `student_transfers`, tanggal efektif untuk mutasi terjadwal #31),
  naik level massal (`student_promotions` append-only — data tahun lama tidak berubah #34),
  status Aktif/Lulus/Pindah/Keluar/Nonaktif dengan riwayat + alasan (`student_status_history`).
  Konfirmasi dialog untuk semua operasi penting (#61); hasil bulk menampilkan santri yang gagal
  beserta alasannya (#62).
- **Riwayat Perkembangan (#43-#48)** — halaman bersama untuk Admin/Koordinator/Ustadz/Wali:
  timeline modern (warna per jenis, tanggal, guru, nilai, catatan) dari view
  `student_development_events` di atas data tahfidz/tartil/setoran/hadits/doa/tajwid/tugas/target/
  jurnal existing. Filter tahun ajaran + semester + jenis + rentang tanggal (#45/#47), ringkasan
  hitungan nyata (#46), pagination "Muat Lebih Banyak" (#71). Ustadz hanya santri binaannya,
  wali hanya anaknya, koordinator sesuai lingkup, DEVELOPER tidak punya akses akademik tenant (#48).
- **Keamanan** — RLS semua tabel baru + RPC security definer memverifikasi session → role →
  tenant; audit `v11_audit` untuk setiap perubahan (#66); notifikasi reusing V10 (#67).

## 24. File SQL Gabungan (setup database 1x run)

File: `supabase/tahfizh-combined.sql` — gabungan seluruh migration (V1 s/d V12) dalam SATU file
untuk di-paste ke Supabase Dashboard → SQL Editor.

- **Idempoten**: aman dijalankan BERULANG kali. Objek/trigger/policy/seed yang sudah ada
  di-skip — tidak ada error "already exists", tidak ada data duplikat, tidak ada data rusak.
- **Aman**: tidak ada drop tabel/kolom data, tidak ada truncate, multi-tenant tetap terisolasi
  penuh (tanpa `USING(true)`).
- Regenerasi otomatis setiap migration berubah:
  `python3 scripts/build-combined-sql.py` lalu validasi: `node scripts/verify-combined-sql.mjs`
  (menjalankan file 2x di Postgres sungguhan/PGlite + sanity count).
- Catatan teknis: 51 `create trigger` dibungkus `DO $$ ... EXECUTE ... EXCEPTION WHEN
  duplicate_object`, dan migration `...15150000_binaan_via_halaqah` kini memulihkan 6 fungsi
  `language sql` + 20 policy RLS yang sebelumnya ikut terhapus oleh `drop table cascade`
  saat `teacher_students` dikonversi menjadi view.
- Fix 42883: backfill default V4/V5/V6 (`tartil`/`setoran`/`learning`) tidak lagi memanggil
  fungsi TRIGGER dengan argumen baris tenants (penyebab error "function
  public.tartil_seed_materials(tenants) does not exist" saat dijalankan di database yang
  sudah punya lembaga). Backfill kini insert langsung dengan `WHERE NOT EXISTS` — aman
  rerun, data lembaga tidak tersentuh. Verifier kini menguji skenario ini secara otomatis.
- Per-tenant guard: ketiga pemanggilan backfill di migration dibungkus loop + exception
  handler — satu tenant yang gagal seed default hanya menjadi WARNING dan TIDAK menggagalkan
  seluruh file; tenant lain tetap terisi.
- **`supabase/fix-backfill-defaults.sql`** — patch kecil (idempoten) untuk database yang
  TERLANJUR memuat fungsi backfill lama yang rusak: ganti 3 fungsi backfill dengan versi
  benar lalu jalankan ulang `tahfizh-combined.sql` versi baru untuk melengkapi skema.
  Simulasi lengkapnya diuji otomatis oleh `node scripts/verify-fix-recovery.mjs`.
- **Data Santri 8 kolom** (migration `...15180000_tahfizh_v12_students_full_columns.sql`):
  tabel Data Santri kini menampilkan NIS, NISN, Nama Lengkap, Nama Panggilan, Jenis Kelamin,
  Halaqah, Nama Wali, No. WhatsApp Wali — sama dengan kolom contoh import Excel. Kolom baru
  `students.nis / nisn / guardian_name / guardian_whatsapp` (NIS/NISN unik per lembaga);
  import Excel kini benar-benar menyimpan NIS/NISN/wali (sebelumnya dibuang) dengan validasi
  duplikat; form tambah/edit santri menerima semua field; RPC `students_manager_list`
  diperluas (drop+create — kompatibel run ulang). Kolom wali ini adalah data induk santri,
  terpisah dari akun login wali (guardians/profiles) yang tetap dikelola sistem akun.
- **Data Santri di dasbor Guru & Koordinator** (migration `...15190000`):
  dashboard guru (`/ustadz`) dan koordinator (`/koordinator`) kini menampilkan tabel
  8 kolom yang sama — guru hanya melihat santri binaannya (RPC SECURITY DEFINER
  `teacher_students_list`, drop+create agar idempoten lintas versi return type).
- **Akun login santri** (migration `...15190000`): saat menambah santri di Data Santri,
  Admin/Koordinator dapat mengisi **username + password** — akun dibuat server-side via
  service-role SETELAH verifikasi session (password di-hash Supabase Auth, tidak pernah
  plaintext). Role memakai `WALI_SANTRI` (label UI V12 = "Santri"; enum lama tidak diubah),
  `students.login_username` menautkan akun ke santri (unique per lembaga), dan
  `must_change_password` mewajibkan ganti password saat login pertama.
- **Login via username** — RPC SECURITY DEFINER `resolve_login_email(p_username)`
  mengembalikan email akun HANYA bila username terdaftar (profiles terlindungi RLS sehingga
  lookup langsung oleh pengunjung yang belum login selalu kosong — itulah mengapa RPC
  diperlukan). Email pribadi pengguna tidak pernah bocor ke pihak lain.
- **Akun otomatis dari nama panggilan (migration `...15200000`)** — berlaku untuk SANTRI
  DAN GURU, di form Tambah maupun import Excel: username = nama panggilan yang dinormalisasi
  (huruf kecil, alfanumerik); bila sudah dipakai DI SELURUH SISTEM (lintas lembaga, cek
  profiles + students + teachers) otomatis menjadi panggilan+2, panggilan+3, dst.
  (zain → zain2). Password = panggilan + 1234 (zain → zain1234), di-hash Supabase Auth,
  tidak pernah plaintext; `must_change_password` wajib ganti saat login pertama. Kolom
  I/J import guru (username/kata sandi) tetap dipakai bila diisi; guru tanpa panggilan
  memakai kata pertama nama lengkap. Kolom baru `teachers.nickname` +
  `teachers.login_username` (username guru tampil di Data Guru & ikut export kolom I).
  RPC `resolve_login_email` v2 kini juga meng-resolve akun guru ber-email asli via
  `auth.users` — guru bisa login dengan username ATAU email.
- **Data & akun DEMO otomatis lembaga baru (V12.3)** — pendaftaran lembaga kini langsung
  membuat 3 guru, 3 santri, 2 halaqah (pengampu + anggota), dan 1 tagihan infak lunas
  (walinya tidak terkunci payment gate) via `src/lib/demo-seed.ts` — SEMUA dengan akun
  login siap pakai: guru **Ahmad / ahmad1234**, **Siti / siti1234**, **Rahmat /
  rahmat1234**; santri **Zain / zain1234**, **Zahra / zahra1234**, **Yusuf / yusuf1234**
  (username = nama panggilan, unik global — bila sudah dipakai menjadi ahmad2, dst.;
  wajib ganti password saat login pertama). Idempoten: kegagalan seed hanya jadi log
  server dan tidak menggagalkan pendaftaran. Script `npm run db:seed-dummy -- --email
  <admin>` memakai modul yang sama — bisa dijalankan ulang di lembaga yang sudah ada
  untuk melengkapi akun login guru/santri yang belum punya.
- **Reset paksa password oleh Admin (V12.4)** — Pengaturan → Keamanan (Admin) kini
  punya kartu **Reset Password Akun**: Admin memilih akun **Santri / Guru / Koordinator**
  lembaganya (cari per nama/username) lalu menetapkan password baru. Keamanan: hanya
  session ADMIN lembaga yang boleh; target wajib satu tenant; akun ADMIN lain dan
  DEVELOPER tidak bisa direset dari sini; password di-hash Supabase Auth via service-role
  (`updateUserById`); `must_change_password` aktif sehingga pemilik akun wajib ganti
  password pada login berikutnya (kartu force-change-password yang sudah ada).
- **Reset Sandi di form Edit (V12.5)** — tombol **Reset Sandi** kini ada langsung di
  bagian bawah form **Edit Guru** (menu Data Guru) dan **Edit Santri** (menu Data Santri);
  perilaku & keamanannya sama dengan kartu V12.4 (hanya Admin lembaga, satu tenant,
  password di-hash Supabase Auth, wajib ganti password login berikutnya). Akun yang belum
  punya username tidak bisa direset dari sini (pesan penjelas tampil).
- **Data Guru via RPC (V12.5)** — menu Data Guru kini membaca data lewat RPC SECURITY
  DEFINER `teachers_manager_list` (drop+create, idempoten): memperbaiki tabel guru yang
  KOSONG bila migration kolom `teachers.nickname`/`login_username` (15200000) belum
  dijalankan di database — RPC men-select kolom baru hanya bila sudah ada di skema,
  sehingga tabel guru tampil di database dengan skema lama maupun baru. Frontend tetap
  punya fallback query langsung; multi-tenant & role tetap diverifikasi di dalam RPC.
- **Grid penilaian Tahfidz guru + sinkron dasbor santri (V12.6, migration `...15220000`)**:
  menu Tahfidz guru (`/ustadz/tahfidz`) kini LANGSUNG menampilkan grid penilaian —
  kolom pertama (menempel saat scroll) nama santri binaan, baris atas daftar surat
  **An-Nas s.d. An-Naba'** (urutan seed V3). Guru memilih mode **Centang / Huruf / Angka**
  lalu memberi nilai per sel (klik: BELUM → Dipelajari → Dinilai; mode Angka/Huruf nilai
  diisi di sel) dan **Simpan** sekali untuk semua perubahan (RPC SECURITY DEFINER
  `tahfidz_save_grid` — verifikasi session → role USTADZ → tenant → binaan halaqah →
  surat aktif → validasi nilai per mode; grade huruf divalidasi terhadap
  `tahfidz_grade_settings` lembaga; trigger histori V3 tetap berjalan). Dasbor santri
  (`/santri`) menampilkan blok **Hafalan Tahfidz** yang SINKRON — membaca tabel
  `tahfidz_assessments` yang sama via RPC `tahfidz_santri_grid` (baris surat × kolom
  anak yang terhubung akun). Migration juga melakukan **backfill surah** untuk lembaga
  lama yang belum punya konfigurasi surah (idempoten, `WHERE NOT EXISTS`).
- **Judul kolom tabel berwarna (V12.6)** — header tabel Data Guru & Data Santri kini
  berwarna berbeda-beda per kolom (sky/emerald/violet/amber/rose/teal/indigo/…), konsisten
  dengan header grid tahfidz.
- **Relasi guru ↔ profil via UUID (V12.11, migration `...18020000`)** — akar masalah "data guru kosong"
  diperbaiki permanen: kolom `teachers.profile_id` (link UUID ke profil akun) + backfill idempoten
  (username → nama persis → nama ternormalisasi) + trigger sinkronisasi dua arah nama profil ↔ guru +
  fungsi `current_teacher_id()`. `halaqah_current_teacher`, `teacher_students_list`, dan RPC grid
  kini men-resolve guru via UUID (fallback nama untuk data lama); semua modul frontend
  (tahfidz/tartil/setoran/hadits/doa/tajwid/target/tugas/jurnal/akademik) memakai pola yang sama.
  Menu **Hadits & Doa Harian** kini tampil di sidebar Koordinator (halaman V12.7 sebelumnya tak
  bisa diakses dari navigasi), dan kartu **wajib ganti password** kini berlaku untuk SEMUA role
  (dirender di DashboardShell, bukan hanya dasbor santri).
- **Hadits & Doa Harian: Koordinator + mode bebas (V12.7, migration `...15230000`)** —
  Koordinator lembaga kini dapat MENAMBAH & mengelola materi Hadits/Doa/Tajwid (menu
  Pengaturan) dan MEMBERIKAN NILAI per santri lewat menu baru **/koordinator/hadits** dan
  **/koordinator/doa** (daftar seluruh santri lembaga → tombol Nilai → form penilaian
  yang sama dengan guru). Mode penilaian **bebas dipilih per penilaian**
  (Centang/Huruf/Angka) untuk guru maupun koordinator — default tetap mode lembaga;
  validasi nilai mengikuti mode terpilih (RPC `learning_save_assessment` v2:
  drop+create, binaan USTADZ via halaqah, ADMIN/KOORDINATOR seluruh santri lembaga,
  multi-tenant tetap terisolasi).
- **Tugas Halaqah — grid penilaian per tugas (V12.8, migration `...15240000`)** — menu
  Tugas guru (`/ustadz/tugas`) kini berbentuk **grid penilaian** seperti tabel rekap:
  header berwarna (pink) — NO, NAMA SANTRI, satu kolom per tugas (judul + tenggat +
  tombol ×), kolom terakhir **% & NILAI**. Guru memberi tugas lewat tombol **Tambah
  Tugas** (judul, halaqah, tanggal pemberian, tenggat, deskripsi) dan tugas itu berlaku
  untuk **SEMUA santri di halaqah tersebut** — kolom tugas langsung muncul di grid.
  Nilai per sel (tugas × santri) dengan **3 mode yang bisa diganti guru**: Centang
  (Mengerjakan — nilai huruf otomatis dari persentase pengerjaan), Huruf (A/B/C/D di
  sel), Angka (1–100 di sel). Simpan sekali untuk semua perubahan (RPC SECURITY
  DEFINER `tugas_halaqah_create` / `tugas_halaqah_save` / `tugas_halaqah_delete` —
  verifikasi session → role → tenant → halaqah yang diampu; grade huruf divalidasi
  terhadap `tahfidz_grade_settings` lembaga; santri non-anggota halaqah tampil “—”;
  hapus tugas = soft delete + ikut menghapus nilainya). RLS tabel
  `tugas_halaqah` + `tugas_halaqah_scores` mengikuti pola tenant+role yang sama.
- **Tajwid Materi — grid penilaian per materi (V12.9, migration `...19200000`)** — menu
  Tajwid guru (`/ustadz/tajwid`) kini berbentuk **grid penilaian** dengan sistem sama
  seperti menu Tugas: header berwarna (biru) — NO, NAMA SANTRI, satu kolom per materi.
  Guru (dan koordinator/admin) menambahkan **materi tajwid lembaga** lewat tombol
  **Tambah Materi** (mis. Mad, Dengung, Iqlab, Idgham) dan tiap materi jadi kolom
  penilaian. Nilai penguasaan per sel (materi × santri) dengan **3 mode yang bisa
  diganti langsung dari menu**: Centang (Menguasai), Huruf (A/B/C/D), Angka (1–100).
  Simpan sekali untuk semua perubahan (RPC SECURITY DEFINER `tajwid_materi_grid` /
  `tajwid_materi_create` / `tajwid_materi_save` / `tajwid_materi_delete` — verifikasi
  session → role → tenant → binaan halaqah guru; grade huruf divalidasi terhadap
  `tahfidz_grade_settings` lembaga; hapus materi = soft delete). RLS tabel
  `tajwid_materi` + `tajwid_materi_scores` mengikuti pola tenant+role yang sama.
- **Hadits & Doa Harian — Tambah Materi langsung di menu (V12.10, migration
  `...19210000`)** — menu Hadits & Doa (guru `/ustadz/hadits` `/ustadz/doa`,
  koordinator `/koordinator/hadits` `/koordinator/doa`) kini punya tombol
  **Tambah Materi** di baris mode penilaian: nama materi (mis. Hadits Arbain 1 /
  Doa Sebelum Makan) langsung jadi **kolom penilaian** di grid — sistem sama dengan
  Tugas/Tajwid. Materi bisa dihapus (ikon × di header kolom) — soft delete
  (`is_active=false`), riwayat penilaian lama tetap tersimpan (append-only);
  menambah materi dengan nama yang sudah pernah ada mengaktifkan kembali baris
  lamanya (tanpa duplikat). RPC SECURITY DEFINER baru
  `learning_material_create(p_module, p_title)` + `learning_material_delete`
  untuk tabel `hadith_materials` / `daily_prayer_materials` / `tajwid_materials`
  (verifikasi session → role → tenant). Nilai siswa tetap lewat
  `learning_save_grid` dengan 3 mode (Centang/Huruf/Angka) yang dipilih dari menu.
- **Setoran Multi-Modul — 3 tab + mode per tab + sinkron dasbor (V12.11, migration
  `...19220000`)** — form setoran guru (`/ustadz/setoran/[studentId]`) kini punya
  **3 tab: Tahfidz Al-Qur'an / Hadits / Doa Harian**. Setoran di tab mana pun
  **otomatis terinput ke modul terkait**: Tahfidz → `tahfidz_submissions`
  (menu Tahfidz), Hadits/Doa → `learning_assessments` (menu Hadits/Doa & grid)
  — tanpa input ganda. **Mode nilai bisa dipilih sendiri per setoran**
  (Centang/Huruf/Angka — RPC `tahfidz_save_submission` v2 menerima `p_mode`,
  null = mode lembaga; RPC learning sudah mendukung mode bebas sejak V12.7).
  Catatan per tab memakai slot masing-masing modul dengan tombol **+ Tambah
  Template** (isi semua slot dari template lembaga) + tombol cepat per slot.
  Dasbor santri (`/santri`) menampilkan blok **Setoran Terakhir per anak**
  via RPC SECURITY DEFINER `setoran_wali_summary()` — hanya setoran anak yang
  terhubung akun; setoran siswa X tampil di dasbor siswa X.
- **Menu Setoran langsung menampilkan form (V12.12)** — `/ustadz/setoran` tidak
  lagi menampilkan daftar santri terlebih dahulu: kartu **"Setoran Hafalan"**
  dengan 3 tab langsung muncul, **Pilih Santri** ada di dalam form (nama + kode).
  Nilai memakai checkbox **"Sudah menguasai / lulus setoran"** pada mode Centang;
  pilih surat otomatis berlanjut ke surat berikutnya setelah simpan; tanggal
  setoran + tombol Simpan di kaki form. Detail per-santri lama tetap ada untuk
  melihat riwayat & mengedit.

- **Perbaikan Import Excel Guru & Santri (V12.14)** — import sebelumnya menolak SEMUA
  baris ("Nama lengkap wajib 2-120 karakter"), termasuk file contoh bawaan: client
  mengirim judul kolom ter-UPPERCASE ("NAMA LENGKAP") sedangkan server mencari
  "Nama Lengkap"/"C". Kini:
  - Aturan kolom, pembacaan header, dan validasi ada di satu modul murni
    `src/lib/import-shared.ts` (dipakai browser DAN server). Judul kolom dikenali lewat
    alias (huruf besar/kecil, spasi, titik, "A. NIS" tidak berpengaruh); cadangan: urutan
    kolom A, B, C…; judul/baris kosong di atas header dilewati; CSV koma maupun titik-koma;
    angka 0 di depan NISN & WhatsApp yang hilang di Excel dipulihkan.
  - Dialog import: **pratinjau** (jumlah baris, kolom terdeteksi, baris bermasalah) →
    import **bertahap** (15 guru / 25 santri per permintaan + progres) → **laporan** alasan
    per baris. `maxDuration = 60` pada 4 halaman Data Guru/Santri.
  - Server: ID baris dibuat di server & insert tanpa `.select()` (tidak bergantung pada
    policy SELECT), fallback insert per baris, pesan error database yang ramah (kolom belum
    ada → jalankan migration; RLS; duplikat NIS/NISN), cek `SUPABASE_SERVICE_ROLE_KEY`
    di awal, akun login dibuat paralel terbatas. Guru: hanya username diisi → sandi
    default panggilan+1234 (file hasil Export kini bisa diimpor ulang).
  - File contoh santri: NISN baris ke-10 kini 10 digit (sebelumnya 11 → ditolak).
  - Verifikasi: `npm run test:import` (21 kasus uji, Node ≥ 22.18).

## 25. Deploy (GitHub → Vercel → Supabase)

1. Push ke GitHub.
2. Import repo di Vercel, set ketiga env var di atas (plus `IPAYMU_*` bila mengaktifkan
   pembayaran otomatis, dan `NEXT_PUBLIC_APP_URL` untuk base URL webhook/return iPaymu).
3. Setup database production — pilih salah satu:
   - **File gabungan (paling praktis):** paste isi `supabase/tahfizh-combined.sql`
     ke SQL Editor — cukup SEKALI, idempoten (aman dijalankan berulang),
     memuat semua migration V1–V12 + seed.
   - Atau `supabase db push` dari CLI (migrasi V1–V12).
4. Di Supabase Auth settings, tambahkan domain Vercel ke **Site URL** dan
   `https://<domain>/reset-password` ke **Redirect URLs**.
5. Daftarkan `https://<domain>/api/webhooks/ipaymu` sebagai Notify URL di dashboard iPaymu.

## Login via Google

Tombol **Masuk dengan Google** ada di halaman `/masuk` dan di form login landing page.
Login Google hanya untuk email yang **sudah terdaftar dan terkonfirmasi** — Google tidak
dipakai untuk mendaftar. Email yang belum terdaftar ditolak dan user auth yang sempat
dibuat Google otomatis dihapus.

Alur: `googleLoginAction` (`src/app/actions/google-auth.ts`) → Google → `/auth/callback`
(tukar `code` jadi session) → `/auth/google/complete` (cek profil + konfirmasi email, lalu
redirect ke dashboard sesuai role).

### Setup (sekali)
1. **Google Cloud Console** → APIs & Services → Credentials → buat *OAuth client ID*
   (Web application). Tambahkan *Authorized redirect URI*:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase** → Authentication → Providers → **Google** → aktifkan, isi Client ID &
   Client Secret.
3. **Supabase** → Authentication → URL Configuration → tambahkan
   `https://<domain-anda>/auth/callback` (dan `http://localhost:3000/auth/callback` untuk
   lokal) ke *Redirect URLs*.
4. Pastikan `NEXT_PUBLIC_APP_URL` terisi domain aplikasi.

Supabase otomatis menautkan identitas Google ke akun email/password yang sudah ada bila
email-nya sama dan terverifikasi. Akun Santri/Guru yang memakai email sintetis
(`@santri.tahfizh.local` / `@guru.tahfizh.local`) tidak bisa memakai Google — tetap login
dengan username.

## Infak Pengembangan di Dasbor Developer

Migration: `supabase/migrations/20260920000000_tahfizh_v12_infak_developer_platform.sql`
Verifikasi: `node scripts/verify-infak-platform.mjs` (Postgres sungguhan via PGlite, 23 pemeriksaan).

Infak Pengembangan adalah pendanaan **platform**, jadi menu dan pengaturannya ada di **dasbor
Developer**, bukan dasbor Admin lembaga.

- **Menu Developer → Infak** (`/developer/infak`): ringkasan bulan berjalan, antrean bukti transfer,
  rincian tagihan per lembaga, semua transaksi (`/transaksi`), dan pengaturan (`/pengaturan`).
  Menu Infak dan langkah "Pengaturan Infak" di Onboarding dihapus dari dasbor Admin.
- **Pengaturan satu untuk semua lembaga** — tabel `platform_payment_settings` (satu baris):
  nominal tagihan (**minimal Rp1.000**, dijaga constraint DB + validasi form), rekening, QRIS,
  instruksi. Hanya DEVELOPER yang bisa menyimpan (`payment_settings_save`). Perubahan nominal
  berlaku untuk tagihan yang dibuat setelahnya. Tabel lama `payment_settings` (per lembaga)
  dibiarkan, tidak dipakai lagi.
- **Tagihan untuk semua santri dari semua lembaga, setiap bulan**:
  - muncul **tanggal 1** (Asia/Jakarta), batas pembayaran **maksimal tanggal 15**; mulai
    tanggal 16 wali yang belum membayar diarahkan ke halaman Infak (gate `wali_payment_gate`);
  - dibuat untuk santri ACTIVE di lembaga ACTIVE, idempoten (tidak pernah ganda);
  - tiga jalur: (1) **pg_cron** `tahfizh-invoice-monthly` tiap hari 00:05 WIB memanggil
    `invoice_generate_all()`; (2) **fallback** — saat wali membuka aplikasi, tagihan bulan
    berjalan anak-anaknya dibuat bila belum ada, jadi aturan tetap jalan walau pg_cron mati;
    (3) tombol **Buat Tagihan Bulan Ini (Semua Lembaga)** di dasbor Developer.
  - Bila pg_cron belum aktif: Supabase → Database → Extensions → aktifkan `pg_cron`, lalu jalankan
    ulang `tahfizh-combined.sql` (idempoten) agar jadwal terpasang.
- **Konfirmasi oleh Developer**: bukti transfer wali → notifikasi ke semua akun DEVELOPER →
  konfirmasi/tolak di `/developer/infak/transaksi/[id]` (`payment_dev_confirm`). RPC
  `payment_admin_*` dan `v10_admin_dashboard` dihapus.
- **Keamanan**: RLS `payment_invoices`/`payment_transactions`/`payment_allocations` kini hanya
  untuk DEVELOPER + wali (tagihan/transaksi miliknya). Admin, koordinator, dan guru lembaga tidak
  bisa membaca data infak. Storage `payment-proofs`: Developer membaca semua bukti dan mengelola
  QRIS di folder `platform/`; pembayar hanya membaca bukti miliknya.
- **Perhatian saat rilis**: begitu migration aktif, wali yang membuka aplikasi **setelah tanggal
  15** dan belum membayar tagihan bulan itu langsung terkunci ke halaman Infak. Jalankan migration
  sebelum tanggal 1 bila ingin wali punya waktu penuh, atau umumkan lebih dulu.

## Bayarkan Santri Lain, Beberapa Bulan, Riwayat per Bulan

Migration: `supabase/migrations/20260920100000_tahfizh_v12_infak_bayar_untuk_lain_multi_bulan.sql`
Verifikasi: `node scripts/verify-infak-bayar-bersama.mjs` (Postgres sungguhan via PGlite, 49 pemeriksaan;
`bun run test:infak` menjalankan ini + `verify-infak-platform.mjs`).

- **Bayarkan santri lain** (`/santri/infak` → "Bayarkan untuk santri lain"): daftar santri aktif di
  **lembaga yang sama** yang punya tunggakan (tagihan `UNPAID` sampai bulan berjalan), bisa dicari
  (nama/kode). **Urutan: paling lama menunggak dulu** — bulan tunggakan tertua, lalu jumlah bulan
  tunggakan terbanyak, lalu nama. Wali mencentang santri → seluruh bulan tunggakannya ikut terpilih;
  "Pilih bulan" untuk memilih sebagian. Santri lembaga lain, santri nonaktif, dan tagihan yang sedang
  diproses tidak bisa dipilih (validasi ulang di `payment_initiate`, bukan hanya di UI).
- **Beberapa bulan sekaligus**: semua tunggakan + bulan berjalan, plus **bayar di muka** untuk anak
  sendiri (1/3/6 bulan cepat, atau pilih bulan satu per satu, maksimal 11 bulan ke depan). Tagihan
  bulan depan dibuat otomatis saat dibayar (nominal mengikuti pengaturan platform saat itu), dan
  pembuatan tagihan bulanan berikutnya tidak menggandakannya. Satu transaksi maksimal 120 tagihan.
  Nominal per bulan boleh lebih dari tagihan (chip Rp5.000 dst. / nominal lain), tidak boleh kurang.
- **Riwayat tetap per bulan**: pembayaran sekaligus tetap tersimpan sebagai satu alokasi per bulan
  (`payment_allocations`). Kartu **Riwayat Infak per Bulan** (dasbor santri & halaman Infak) menampilkan
  satu baris per bulan dengan keterangan, mis. *"Dibayarkan tanggal 20 September 2026 · dibayar di
  muka · sekaligus 3 bulan · oleh Ahmad"*. Tanggal = saat bukti transfer dikirim
  (`payment_transactions.submitted_at`, kolom baru) atau saat webhook otomatis diterima.
- **Dasbor santri yang dibayarkan**: kartu "Status Tagihan Bulan Ini" menampilkan *"Dibayarkan oleh
  {nama pembayar} · tanggal …"* (atau "Dibayar sendiri"). Nama pembayar hanya bisa dibaca lewat RPC
  `payment_wali_status` / `payment_wali_history` (SECURITY DEFINER, hanya untuk anak milik akun itu);
  RLS `payment_transactions` tetap hanya untuk pembayar + Developer.
- **Perbaikan keamanan**: `payment_mark_paid_auto` dan `payment_expire_auto` sebelumnya di-grant ke
  `authenticated` tanpa cek pemanggil, sehingga wali bisa menandai transaksinya LUNAS lewat RPC dari
  browser tanpa membayar. Kini hak eksekusi dicabut dari `public/anon/authenticated` dan hanya untuk
  `service_role` (dipakai webhook iPaymu lewat `createAdminClient`). **Jalankan migration ini segera.**
- RPC: `payment_initiate` (banyak santri × banyak bulan, buat tagihan di muka), `payment_wali_invoices`
  (anak sendiri + `ahead` 11 bulan + `others` terurut), `payment_wali_status` (siapa pembayar),
  `payment_wali_history` (baru), `payment_submit_proof` (mencatat `submitted_at`).
- **Perbaikan tautan**: migration `20260920110000_tahfizh_v12_infak_notif_link_santri.sql` mengganti tautan
  notifikasi pembayaran otomatis dari `/wali/infak/…` (rute sudah tidak ada → 404) ke `/santri/infak`.

## Sistem Desain & Warna per Role

Tampilan dashboard kini punya identitas warna per role. Semua diatur terpusat di
`src/app/globals.css`, jadi menu baru otomatis ikut tanpa styling tambahan.

| Role | Warna | Atribut |
| --- | --- | --- |
| Developer | Violet | `data-role="developer"` |
| Admin | Biru | `data-role="admin"` |
| Koordinator | Teal | `data-role="koordinator"` |
| Ustadz | Hijau | `data-role="ustadz"` |
| Santri | Amber | `data-role="santri"` |

`DashboardShell` memasang `data-role` di pembungkus utama. Di dalamnya tersedia token
`--role`, `--role-strong`, `--role-soft`, `--role-ink` (ada versi terang & gelap) dan utility
Tailwind `bg-role`, `bg-role-soft`, `text-role-strong`, `text-role-ink`, `border-role/…`.

**Komponen bersama (otomatis berlaku di semua role)**

- `PageHeader` (`components/dashboard/section.tsx`) — banner judul berwarna role; prop `icon` opsional.
- `SectionTitle` — judul bagian di dalam kartu: chip ikon berwarna + judul + keterangan + aksi.
  Prop `tone`: `role | blue | emerald | amber | violet | sky | rose | orange`.
- `Table` — judul kolom berwarna-warni otomatis (siklus 8 warna + titik penanda), baris zebra halus,
  hover berwarna role. Kolom `text-right` tidak diberi titik. Warna kolom bisa ditimpa dengan
  utility `text-*` biasa (aturan dasar berada di `@layer base`).
- `Badge` — varian baru: `success`, `warning`, `info`, `danger`, `violet`, `neutral`, `role`.
- `Button` — varian `role` (warna identitas role).
- `StatCard` — 15 ikon bermakna (`paid`, `unpaid`, `wallet`, `invoice`, `feedback`, …) dan prop
  `progress` (0–100) untuk bilah kemajuan.
- Kelas lama `bg-gradient-brand` tetap ada; di dalam dashboard ia otomatis mengikuti warna role,
  di landing/login tetap biru.

**Catatan**: gunakan token semantik (`text-foreground`, `text-muted-foreground`, `bg-card`,
`bg-muted`, `border-border`) alih-alih `text-slate-*`/`bg-white` agar dark mode benar.

## V17 — Target per Halaqah (menggantikan Target per santri)

Migration: `supabase/migrations/20260921010000_tahfizh_v17_target_halaqah.sql`

- **Target diatur per halaqah, bukan per santri** — menu `/ustadz/target`. Tiap halaqah yang
  diampu punya 3 target tetap: **Tahfidz Al-Qur'an** (satuan surat), **Hadits** (hadits), dan
  **Doa** (doa). Satu halaqah = satu target per jenis (`unique (halaqah_id, category)`), dengan
  jumlah, periode mulai–selesai, dan keterangan opsional.
- Tabel `halaqah_targets`; RPC `target_halaqah_overview`, `target_halaqah_save`,
  `target_halaqah_clear` (hanya USTADZ pengampu halaqah). RLS select: tenant + role.
- **Target lama dihapus total**: tabel `targets` & `target_progress_history`, RPC `target_*`,
  enum `target_status`, baris Target di raport (`report_student_data`), event TARGET di
  `student_development_events`, ringkasan target di detail santri. Migration bersifat
  destruktif — backup data target lama bila diperlukan.
- Dashboard guru: widget "Target Halaqah Aktif" = target halaqah yang periodenya belum lewat.
- Belum ada perhitungan capaian otomatis (hanya penetapan sasaran).
