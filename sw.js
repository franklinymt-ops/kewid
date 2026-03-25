// ── Service Worker – Control Liquidación Kewid ──
// Versión: actualiza este número cada vez que subas cambios
const CACHE_NAME = 'kewid-v1';

// Archivos que se guardan para funcionar sin internet
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Fuentes de Google (se cachean la primera vez que se usan)
const GOOGLE_FONTS = [
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;600&display=swap'
];

// ── Instalación: guardar archivos en caché ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Guardando archivos en caché...');
      return cache.addAll(ASSETS).catch(err => {
        console.log('[SW] Error al cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar cachés viejos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché viejo:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: responder con caché o red ──
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Requests externos (APIs, Notion, Sheets) → siempre van a la red
  if (
    url.includes('api.notion.com') ||
    url.includes('script.google.com') ||
    url.includes('api.anthropic.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fuentes de Google → cache first, luego red
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Todo lo demás → caché primero, red como respaldo
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Actualiza en segundo plano (stale-while-revalidate)
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }
      // No está en caché → ir a la red
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        // Sin red y sin caché → página de error mínima
        return new Response(
          `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;padding:2rem;background:#0d1117;color:#e6edf3;text-align:center;">
            <h2>📱 Sin conexión</h2>
            <p>Estás sin internet pero tu app sigue funcionando.<br/>
            Vuelve a la pantalla principal.</p>
            <a href="./index.html" style="color:#f0a500;">← Ir al inicio</a>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    })
  );
});
