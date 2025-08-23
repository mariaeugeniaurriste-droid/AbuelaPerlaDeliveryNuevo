// sw.js — PWA shell + actualizaciones + offline (mejorado)
const CACHE = 'abuela-perla-v3';

// Si hospedás en subcarpeta, poné BASE = self.registration.scope (termina con /)
const BASE = new URL(self.registration.scope).pathname; // p.ej "/" o "/abuela-perla/"

const assets = [
  '',               // equivale a BASE (home)
  'index.html',
  'admin.html',
  'cocina.html',
  'styles.css',
  'app.js',
  'admin.js',
  'cocina.js',
  'assets/ap-32.png',
  'assets/ap-192.png',
  'assets/ap-512.png',
  'assets/logo.png',
];

// Normaliza a rutas absolutas dentro del scope
const ASSETS = assets.map(p => new URL(p, self.registration.scope).pathname);

// Dominios que NUNCA cacheamos (APIs y WhatsApp)
const NO_CACHE_HOSTS = new Set([
  'script.google.com',
  'script.googleusercontent.com',
  'wa.me',
  'api.whatsapp.com',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Navegation preload (si el browser lo soporta) — mejora FCP
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    const cache = await caches.open(CACHE);
    // Usamos Request(..., {cache:'reload'}) para evitar HTTP cache viejo en la instalación
    const reqs = ASSETS.map(url => new Request(url, { cache: 'reload' }));
    await cache.addAll(reqs);
    // Listo para activar sin esperar
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE) && caches.delete(k)));
    self.clients.claim();
  })());
});

// Permite que la UI haga "actualizar ahora" (registration.waiting.postMessage)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== 'GET') return;

  // No cachear APIs externas (Apps Script / WhatsApp)
  if (NO_CACHE_HOSTS.has(url.hostname)) {
    return event.respondWith(fetch(req));
  }

  // NAVEGACIONES (documentos HTML): network-first con fallback a caché
  const isNav = req.mode === 'navigate' ||
                (req.destination === 'document') ||
                ((req.headers.get('accept') || '').includes('text/html'));

  if (isNav) {
    event.respondWith((async () => {
      try {
        // Usa preload si está disponible
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(new Request(url.pathname), net.clone());
        return net;
      } catch {
        // Fallback a caché: intentar el path exacto y luego el index
        const cache = await caches.open(CACHE);
        const cached = await cache.match(new Request(url.pathname), { ignoreSearch: true });
        if (cached) return cached;
        // fallback a index del scope
        const indexPath = new URL('index.html', self.registration.scope).pathname;
        return (await cache.match(indexPath)) || cache.match(new URL(BASE, self.location).pathname);
      }
    })());
    return;
  }

  // ESTÁTICOS MISMO ORIGEN: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // ignoramos querystring para soportar ?v=123
      const cacheKey = new Request(url.pathname);
      const cached = await cache.match(cacheKey, { ignoreSearch: true });

      const fetchPromise = fetch(req).then(net => {
        cache.put(cacheKey, net.clone());
        return net;
      }).catch(() => null);

      return cached || (await fetchPromise) || (await caches.match(new URL(BASE, self.location).pathname));
    })());
    return;
  }

  // Otros (cross-origin no críticos): network-first simple
  event.respondWith(fetch(req).catch(() => caches.match(new URL(BASE, self.location).pathname)));
});
const ASSETS = [
  '/', '/index.html', '/admin.html', '/cocina.html',
  '/styles.css', '/app.js', '/admin.js', '/cocina.js',
  '/assets/ap-32.png', '/assets/ap-192.png', '/assets/ap-512.png', '/assets/logo.png'
];
