/**
 * V39 — Ikon menu kustom (Pengaturan Developer).
 *
 * Katalog ini CLIENT-SAFE (tanpa import berat dari paket ikon) supaya bisa
 * dipakai di Server Component (resolusi ikon per render) maupun Client
 * Component (picker). Komponen Phosphor yang sesuai di-resolve terpusat di
 * `src/components/icons/phosphor-icons.tsx` (1 tempat, tanpa duplikasi).
 *
 * `menu_key` berbagi namespace dengan:
 *   - NavKey        (src/lib/terminology-shared.ts) — sidebar / menu bawah
 *   - QuickMenu key (src/lib/quick-menu.ts)         — menu cepat dashboard
 */

/* ------------------------------------------------------------------------ */
/* Tipe                                                                      */
/* ------------------------------------------------------------------------ */

export type MenuIconKind = "PHOSPHOR" | "CUSTOM";

export type MenuIconOverride = {
  menuKey: string;
  kind: MenuIconKind;
  /** Nama komponen Phosphor (mis. "BookOpen") — hanya untuk kind PHOSPHOR. */
  iconName: string | null;
  /** Path berkas di bucket `menu-icons` (mis. "menu-icons/abc123.png"). */
  storagePath: string | null;
};

/** Hasil resolusi siap-render. */
export type ResolvedMenuIcon =
  | { kind: "phosphor"; name: string }
  | { kind: "custom"; url: string }
  | { kind: "default" };

/* ------------------------------------------------------------------------ */
/* Katalog Phosphor — dikurasi (nama terverifikasi @phosphor-icons/react)    */
/* ------------------------------------------------------------------------ */

export type PhosphorIconChoice = {
  /** Nama komponen Phosphor (PascalCase). */
  name: string;
  label: string;
};

export const PHOSPHOR_CATALOG_GROUPS: { group: string; items: PhosphorIconChoice[] }[] = [
  {
    group: "Umum",
    items: [
      { name: "SquaresFour", label: "Kotak (Dasbor)" },
      { name: "GridFour", label: "Grid" },
      { name: "Layout", label: "Tata Letak" },
      { name: "House", label: "Rumah" },
      { name: "HouseSimple", label: "Rumah Sederhana" },
      { name: "Compass", label: "Kompas" },
      { name: "Rocket", label: "Roket" },
      { name: "Lightning", label: "Kilat" },
      { name: "Sparkle", label: "Kilau" },
      { name: "Star", label: "Bintang" },
      { name: "StarFour", label: "Bintang Empat" },
    ],
  },
  {
    group: "Lembaga & Orang",
    items: [
      { name: "Buildings", label: "Gedung (Lembaga)" },
      { name: "Bank", label: "Bank" },
      { name: "Users", label: "Orang" },
      { name: "UsersThree", label: "Tiga Orang" },
      { name: "Person", label: "Orang Tunggal" },
      { name: "ChalkboardTeacher", label: "Guru" },
      { name: "GraduationCap", label: "Toga (Santri)" },
      { name: "Student", label: "Pelajar" },
      { name: "IdentificationCard", label: "Kartu Identitas" },
      { name: "Crown", label: "Mahkota (Pimpinan)" },
      { name: "Handshake", label: "Jabat Tangan" },
    ],
  },
  {
    group: "Al-Qur'an & Pembelajaran",
    items: [
      { name: "Book", label: "Buku" },
      { name: "BookOpen", label: "Buku Terbuka" },
      { name: "BookBookmark", label: "Buku Penanda" },
      { name: "BookmarkSimple", label: "Penanda" },
      { name: "Books", label: "Tumpukan Buku" },
      { name: "Scroll", label: "Gulungan" },
      { name: "Article", label: "Artikel" },
      { name: "Newspaper", label: "Koran" },
      { name: "Mosque", label: "Masjid" },
      { name: "MoonStars", label: "Bulan & Bintang" },
      { name: "HandsPraying", label: "Tangan Berdoa" },
      { name: "HandHeart", label: "Tangan Hati" },
      { name: "Waveform", label: "Gelombang (Tartil)" },
    ],
  },
  {
    group: "Penilaian & Laporan",
    items: [
      { name: "ClipboardText", label: "Papan Klip" },
      { name: "Clipboard", label: "Papan Klip Polos" },
      { name: "ListChecks", label: "Daftar Centang" },
      { name: "CheckSquare", label: "Kotak Centang" },
      { name: "CheckCircle", label: "Lingkaran Centang" },
      { name: "CheckFat", label: "Centang Tebal" },
      { name: "Notebook", label: "Buku Catatan" },
      { name: "Note", label: "Catatan" },
      { name: "PencilSimple", label: "Pensil" },
      { name: "Queue", label: "Antrean" },
      { name: "Exam", label: "Ujian" },
      { name: "Certificate", label: "Sertifikat" },
      { name: "Medal", label: "Medali" },
      { name: "Trophy", label: "Piala" },
      { name: "SealCheck", label: "Segel Centang" },
      { name: "Target", label: "Target" },
      { name: "Crosshair", label: "Bidik" },
      { name: "Intersect", label: "Irisan (Target)" },
      { name: "Flag", label: "Bendera" },
      { name: "Scales", label: "Timbangan" },
      { name: "Percent", label: "Persen" },
      { name: "ChartBar", label: "Diagram Batang" },
      { name: "ChartLineUp", label: "Grafik Naik" },
      { name: "Presentation", label: "Presentasi" },
      { name: "Broadcast", label: "Siaran" },
    ],
  },
  {
    group: "Presensi & Waktu",
    items: [
      { name: "CalendarCheck", label: "Kalender Centang" },
      { name: "CalendarBlank", label: "Kalender" },
      { name: "Clock", label: "Jam" },
      { name: "ClockCounterClockwise", label: "Riwayat" },
      { name: "Cards", label: "Kartu" },
      { name: "Cardholder", label: "Pemegang Kartu" },
    ],
  },
  {
    group: "Keuangan",
    items: [
      { name: "HandCoins", label: "Tangan Koin" },
      { name: "Wallet", label: "Dompet" },
      { name: "Money", label: "Uang" },
      { name: "Coins", label: "Koin" },
      { name: "CurrencyCircleDollar", label: "Dolar" },
    ],
  },
  {
    group: "Komunikasi",
    items: [
      { name: "ChatsCircle", label: "Dua Obrolan" },
      { name: "ChatsTeardrop", label: "Obrolan Tetes" },
      { name: "ChatCenteredDots", label: "Obrolan Titik" },
      { name: "ChatCircleDots", label: "Obrolan Bulat" },
      { name: "ChatCircleText", label: "Obrolan Teks Bulat" },
      { name: "ChatText", label: "Obrolan Teks Kotak" },
      { name: "PaperPlaneRight", label: "Kirim Pesan" },
      { name: "WhatsappLogo", label: "WhatsApp" },
      { name: "EnvelopeSimple", label: "Amplop" },
      { name: "Bell", label: "Lonceng" },
    ],
  },
  {
    group: "Pengaturan & Utilitas",
    items: [
      { name: "Gear", label: "Gigi Pengaturan" },
      { name: "GearSix", label: "Gigi Enam" },
      { name: "SlidersHorizontal", label: "Penggeser" },
      { name: "PaintBrush", label: "Kuas" },
      { name: "Palette", label: "Palet" },
      { name: "Images", label: "Gambar" },
      { name: "Image", label: "Gambar Tunggal" },
      { name: "Files", label: "Berkas" },
      { name: "FolderOpen", label: "Folder" },
      { name: "ShieldCheck", label: "Perisai" },
      { name: "LockKey", label: "Kunci" },
      { name: "Lifebuoy", label: "Pelampung" },
      { name: "Question", label: "Tanya" },
      { name: "Info", label: "Info" },
      { name: "Warning", label: "Peringatan" },
      { name: "Prohibit", label: "Larangan" },
      { name: "TrashSimple", label: "Tempat Sampah" },
      { name: "Broom", label: "Sapu" },
      { name: "ArrowCounterClockwise", label: "Putar Balik" },
      { name: "ArrowsDownUp", label: "Panah Atas-Bawah" },
      { name: "ArrowsClockwise", label: "Segarkan" },
      { name: "MagnifyingGlass", label: "Kaca Pembesar" },
      { name: "DownloadSimple", label: "Unduh" },
      { name: "UploadSimple", label: "Unggah" },
      { name: "MapTrifold", label: "Peta" },
      { name: "Path", label: "Jalur" },
      { name: "Signpost", label: "Papan Arah" },
      { name: "TreeStructure", label: "Struktur Pohon" },
      { name: "FlowArrow", label: "Alur" },
      { name: "PuzzlePiece", label: "Puzzle" },
    ],
  },
];

/** Daftar datar untuk grid picker + validasi. */
export const PHOSPHOR_ICON_CATALOG: PhosphorIconChoice[] = PHOSPHOR_CATALOG_GROUPS.flatMap(
  (g) => g.items
);

/** Set nama valid — dipakai memvalidasi pilihan sebelum dikirim ke RPC. */
export const VALID_PHOSPHOR_NAMES: ReadonlySet<string> = new Set(
  PHOSPHOR_ICON_CATALOG.map((c) => c.name)
);

/* ------------------------------------------------------------------------ */
/* Resolver override (pure — aman dipakai di mana saja)                      */
/* ------------------------------------------------------------------------ */

const MENU_ICON_PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/menu-icons/`;

/** Bangun URL publik dari path storage bucket `menu-icons`. */
export function menuIconPublicUrl(path: string): string {
  return `${MENU_ICON_PUBLIC_BASE}${path}`;
}

/**
 * Cari override untuk satu menu key. Peta dikunci menu_key lowercase —
 * toleran terhadap perbedaan casing antara NavKey dan key Menu Cepat.
 */
export function findMenuIconOverride(
  overrides: MenuIconOverride[] | null | undefined,
  menuKey: string
): MenuIconOverride | null {
  if (!overrides || overrides.length === 0 || !menuKey) return null;
  const key = menuKey.toLowerCase();
  return overrides.find((o) => o.menuKey.toLowerCase() === key) ?? null;
}

/**
 * Resolve ikon final untuk satu menu: override Phosphor / unggahan custom,
 * atau "default" (ikon lucide bawaan yang di-render pemanggil).
 */
export function resolveMenuIcon(
  overrides: MenuIconOverride[] | null | undefined,
  menuKey: string
): ResolvedMenuIcon {
  const o = findMenuIconOverride(overrides, menuKey);
  if (!o) return { kind: "default" };
  if (o.kind === "CUSTOM" && o.storagePath) return { kind: "custom", url: menuIconPublicUrl(o.storagePath) };
  if (o.kind === "PHOSPHOR" && o.iconName) return { kind: "phosphor", name: o.iconName };
  return { kind: "default" };
}

/** Ambil nama Phosphor dari override bila ada; null = pakai ikon bawaan. */
export function menuIconPhosphorName(
  overrides: MenuIconOverride[] | null | undefined,
  menuKey: string
): string | null {
  const r = resolveMenuIcon(overrides, menuKey);
  return r.kind === "phosphor" ? r.name : null;
}

/** Ambil URL gambar custom dari override bila ada; null = pakai ikon bawaan. */
export function menuIconCustomUrl(
  overrides: MenuIconOverride[] | null | undefined,
  menuKey: string
): string | null {
  const r = resolveMenuIcon(overrides, menuKey);
  return r.kind === "custom" ? r.url : null;
}
