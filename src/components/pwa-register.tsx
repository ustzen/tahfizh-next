"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan service worker (/sw.js) supaya TAHFIZH memenuhi syarat PWA
 * (bisa di-install). Tanpa pendaftaran ini file public/sw.js tidak pernah
 * dijalankan browser dan opsi "Install aplikasi" tidak muncul.
 *
 * Hanya di production: di `next dev` SW tidak didaftarkan agar tidak
 * mengganggu hot reload.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.error("[pwa] gagal mendaftarkan service worker:", err);
      });
    };

    // Tunggu halaman selesai dimuat agar tidak menahan render awal.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
