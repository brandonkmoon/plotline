// Plotline Service Worker — lightweight offline shell + asset caching
const CACHE_NAME = "plotline-v1";
const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/plotline-title.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET requests are cacheable.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Never cache API responses — they must always come fresh from the network.
  if (isSameOrigin && url.pathname.startsWith("/api/")) return;

  // Cache-first for immutable static assets only: hashed build output,
  // fonts, and icons/images. These change rarely (or carry a new hash),
  // so serving them from cache is safe and fast.
  const isStaticAsset =
    isSameOrigin &&
    (url.pathname.startsWith("/_next/static/") ||
      /\.(?:woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Page navigations: network-first so the live app always loads online,
  // falling back to the cached app shell ("/") only when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Everything else (cross-origin, non-static, non-navigation) passes
  // straight through to the network with no caching.
});
