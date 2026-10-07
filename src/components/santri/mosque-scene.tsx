/**
 * Dekorasi hero dasbor santri — pemandangan masjid biru di langit cerah,
 * mengikuti mockup (dipakai halaman Target & Presensi). SVG inline (tanpa
 * dependensi) agar aman di server component dan tetap tajam di segala ukuran.
 */
export function MosqueScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      preserveAspectRatio="xMaxYMax meet"
    >
      {/* Awan */}
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="58" cy="40" rx="34" ry="13" />
        <ellipse cx="88" cy="33" rx="22" ry="10" />
        <ellipse cx="252" cy="54" rx="30" ry="12" />
        <ellipse cx="224" cy="47" rx="20" ry="9" />
      </g>

      {/* Hamparan hijau */}
      <g opacity="0.95">
        <ellipse cx="46" cy="200" rx="86" ry="30" fill="#8ddf68" />
        <ellipse cx="300" cy="206" rx="96" ry="34" fill="#78d155" />
      </g>

      {/* Pohon besar kanan */}
      <rect x="288" y="146" width="7" height="48" rx="3.5" fill="#b07a4a" />
      <circle cx="291" cy="140" r="24" fill="#8ddf68" />
      <circle cx="272" cy="152" r="16" fill="#9ce57a" />
      <circle cx="310" cy="152" r="15" fill="#7fd25a" />

      {/* Menara kiri */}
      <rect x="84" y="80" width="15" height="112" rx="7.5" fill="#c3e3ff" />
      <ellipse cx="91.5" cy="80" rx="9.5" ry="12" fill="#59b0f5" />
      <rect x="90" y="60" width="3" height="12" rx="1.5" fill="#3f8fd6" />
      <circle cx="91.5" cy="57" r="3.6" fill="#f6c445" />

      {/* Menara kanan */}
      <rect x="221" y="80" width="15" height="112" rx="7.5" fill="#c3e3ff" />
      <ellipse cx="228.5" cy="80" rx="9.5" ry="12" fill="#59b0f5" />
      <rect x="227" y="60" width="3" height="12" rx="1.5" fill="#3f8fd6" />
      <circle cx="228.5" cy="57" r="3.6" fill="#f6c445" />

      {/* Kubah utama */}
      <path d="M160 40c-27 23-35 53-35 76h70c0-23-8-53-35-76Z" fill="#59b0f5" />
      <path d="M160 40c-27 23-35 53-35 76h16c0-20 6-48 19-76Z" fill="#7ac1fb" />
      <rect x="150" y="28" width="20" height="14" rx="7" fill="#c3e3ff" />
      <circle cx="160" cy="24" r="4" fill="#f6c445" />

      {/* Badan masjid */}
      <rect x="118" y="114" width="84" height="78" rx="7" fill="#eef7ff" />
      <rect x="118" y="114" width="84" height="10" rx="5" fill="#d6ecff" />

      {/* Pintu & lengkungan */}
      <path d="M152 192v-30a8 8 0 0 1 16 0v30Z" fill="#bcdcff" />
      <path d="M131 192v-19a5.5 5.5 0 0 1 11 0v19Z" fill="#cfe8ff" />
      <path d="M179 192v-19a5.5 5.5 0 0 1 11 0v19Z" fill="#cfe8ff" />
    </svg>
  );
}
