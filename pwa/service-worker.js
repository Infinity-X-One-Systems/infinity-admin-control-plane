/**
 * INFINITY ADMIN CONTROL PLANE — Service Worker
 * Cache-first strategy for offline capability.
 * Stale-while-revalidate for API state files.
 */

const CACHE_NAME    = 'iacp-v1';
const API_CACHE     = 'iacp-api-v1';

// Static shell assets to precache
const PRECACHE_URLS = [
  '/dashboard/',
  '/dashboard/index.html',
  '/dashboard/app.js',
  '/dashboard/github-api.js',
  '/dashboard/styles/main.css',
  '/pwa/manifest.json',
];

// ── INSTALL: Precache static shell ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Clean up old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Serve from cache, update in background ─────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // GitHub API calls: network-first (don't cache)
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(request).catch(() => new Response('{"error":"offline"}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // _STATE files: stale-while-revalidate
  if (url.pathname.includes('/_STATE/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // CDN resources (Monaco, etc.): cache-first — exact hostname match
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // App shell: cache-first
  event.respondWith(cacheFirst(request, CACHE_NAME));
});

// ── HELPERS ──────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
}
