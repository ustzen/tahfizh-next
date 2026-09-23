"use client";

import { useEffect } from "react";

/**
 * Fallback terakhir bila error terjadi di luar boundary mana pun (termasuk
 * layout root) — HTML minimal tanpa dependensi layout, tetap ramah pengguna.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "#fee2e2",
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
          }}
        >
          !
        </div>
        <h1 style={{ fontSize: 22, margin: "8px 0 0" }}>Terjadi kendala pada aplikasi</h1>
        <p style={{ color: "#64748b", fontSize: 14, maxWidth: 380, margin: 0 }}>
          Maaf, aplikasi tidak dapat dimuat saat ini. Silakan coba lagi.
        </p>
        {error?.digest && (
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>Kode laporan: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "10px 22px",
            borderRadius: 10,
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Coba Lagi
        </button>
      </body>
    </html>
  );
}
