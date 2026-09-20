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
    // staleTime-nya belum lewat. `dynamic` sebelumnya 0 (default) — setiap
    // klik menu selalu menunggu render server penuh. `revalidatePath` dari
    // server action tetap meng-invalidate cache ini, jadi data tidak basi
    // setelah simpan/edit.
    staleTimes: {
      dynamic: 600,
      static: 600,
    },
  },
};

export default nextConfig;
