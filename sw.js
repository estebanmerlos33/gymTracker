const CACHE_NAME = "entreno-cache-v4";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

// Al instalar, guarda todos los archivos de la app en cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

// Al activar, borra caches viejos de versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: cache primero, red como respaldo (sirve para offline)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((respuestaCache) => {
      return respuestaCache || fetch(event.request);
    })
  );
});