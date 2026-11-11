import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The default (CPU-count based) spawns dozens of workers during
  // "Collecting page data", which gets OOM-killed in memory-limited
  // environments. A small fixed pool keeps builds stable; see
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/workerThreads
  experimental: {
    workerThreads: false,
    cpus: 2,
    // Router Cache klien: halaman yang sudah pernah dibuka dirender ulang
    // instan dari cache browser (terasa seperti klik antar-tab) selama
    // staleTime-nya belum lewat. `dynamic` 0 (default) mematikan cache ini —
    // setiap klik menu selalu menunggu render server penuh (terasa lambat
    // di mobile). 30 detik membuat navigasi ulang instan; data tetap segar
    // karena setiap server action memanggil revalidatePath (meng-invalidate
    // cache ini setelah simpan/edit).
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // PWA: service worker harus selalu diambil ulang (tidak di-cache lama) agar
  // pembaruan sampai ke pengguna; manifest memakai MIME yang benar.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
