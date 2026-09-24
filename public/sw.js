// Service worker minimal — TAHFIZH PWA.
// Tujuannya hanya memenuhi syarat "installability" (Chrome/Android
// mewajibkan SW dengan fetch handler yang terdaftar di scope halaman).
// Sengaja TIDAK melakukan caching agresif dulu supaya data dashboard
// (yang selalu server-rendered & tenant-spesifik) tidak pernah basi.

const CACHE_NAME = "tahfizh-shell-v2";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, dengan fallback ke cache hanya untuk aset shell statis
// di atas. Semua request lain (halaman, data) selalu lewat network apa
// adanya — ini bukan offline-app, hanya supaya prompt instal muncul.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isShellAsset = APP_SHELL.some((p) => url.pathname === p);
  if (!isShellAsset) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
