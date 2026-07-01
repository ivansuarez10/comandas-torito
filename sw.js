/* Comandas/Pedidos El Torito — Service Worker (app-shell offline).
   NUNCA cachea Supabase (datos + realtime deben ir siempre a la red). */
const CACHE = 'torito-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/torito-badge.png',
  './assets/torito-wordmark.svg',
  './assets/torito-bull.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Datos/realtime de Supabase: siempre a la red, nunca cache.
  if (url.hostname.includes('supabase.co')) return;
  // App-shell: cache-first, con actualización en segundo plano.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
        return resp;
      }).catch(() => cached || caches.match('./index.html'));
      return cached || net;
    })
  );
});
