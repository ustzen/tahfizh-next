/**
 * Ikon masjid inline (server + client safe — tanpa "use client", tanpa
 * dependensi ikon eksternal). Dipakai hero halaman Infak & Kartu Prestasi
 * mengikuti mockup.
 */
export function MosqueGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Kubah */}
      <path d="M12 2.5c2.6 2 4.2 4 4.2 6.1 0 1.9-1.7 3.4-4.2 3.4s-4.2-1.5-4.2-3.4c0-2.1 1.6-4.1 4.2-6.1Z" />
      {/* Badan masjid */}
      <path d="M5.5 21.5v-8.2c0-1 .8-1.8 1.8-1.8h9.4c1 0 1.8.8 1.8 1.8v8.2" />
      {/* Pintu lengkung */}
      <path d="M10 21.5v-3.3c0-1.1.9-2 2-2s2 .9 2 2v3.3" />
      {/* Menara kiri & kanan */}
      <path d="M3.5 21.5v-9l1.7-2.3 1.6 2.3v9" />
      <path d="M17.2 21.5v-9l1.6-2.3 1.7 2.3v9" />
      {/* Bulan sabit kecil di puncak */}
      <path d="M12 1.2c.5-.4 1.3-.2 1.5.4-.7 0-1 .4-1 .9-.5-.2-.8-1-.5-1.3Z" />
      {/* Garis dasar */}
      <path d="M2.5 21.5h19" />
    </svg>
  );
}
