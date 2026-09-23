/**
 * Rate limiter in-memory per kunci (IP / username).
 *
 * Maksud: melindungi action auth (login, pendaftaran, lupa password, reset
 * via username) dari brute-force/spam dasar. Bukan pengganti limit bawaan
 * Supabase Auth — lapisan ekstra murah yang berjalan sebelum kueri apa pun.
 *
 * Penyimpanan: Map di memori proses Node. Setiap server yang menjalankan
 * Next.js punya hitungannya sendiri; hilang saat restart. Untuk app satu
 * proses seperti ini itu cukup; limit bawaan Supabase tetap ada di belakang.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Bersihkan entri kedaluwarsa secara berkala agar Map tidak tumbuh tanpa batas. */
const CLEANUP_EVERY_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Detik sampai jendela di-reset (untuk pesan ke pengguna). */
  retryAfterSeconds: number;
};

/**
 * Cek & konsumsi satu slot. `key` bebas (mis. `login:<ip>` atau `signup:<ip>`).
 * Window bergulir sederhana: slot di-reset penuh setelah `windowMs`.
 */
export function consumeRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Baca IP klien dari header standar di belakang proxy (Vercel/Freebuff/Nginx). */
export async function clientIpFromHeaders(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
