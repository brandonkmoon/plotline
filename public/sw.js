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

  // Skip non-GET and WebSocket/PartyKit requests
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/parties/") || url.pathname.startsWith("/party/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful same-origin responses (pages, static assets)
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
