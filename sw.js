/* Comandas/Pedidos El Torito — Service Worker (app-shell offline).
   NUNCA cachea Supabase (datos + realtime deben ir siempre a la red). */
const CACHE = 'torito-v3';
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

/* ===== WEB PUSH: aviso de comanda nueva (funciona con app cerrada / pantalla bloqueada) ===== */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Nueva comanda';
  const opts = {
    body: d.body || 'Entró un pedido nuevo',
    icon: './assets/torito-badge.png',
    badge: './assets/torito-badge.png',
    tag: 'comanda-nueva',
    renotify: true,
    requireInteraction: true,          // la notificación queda hasta que la toquen (no se desvanece)
    vibrate: [250, 120, 250, 120, 250], // vibración (Android)
    data: { url: './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Datos/realtime de Supabase: siempre a la red, nunca cache.
  if (url.hostname.includes('supabase.co')) return;
  const isNav = e.request.mode === 'navigate' || e.request.destination === 'document';
  if (isNav) {
    // HTML: network-first → siempre la última versión si hay señal; cache solo como respaldo offline.
    e.respondWith(
      fetch(e.request).then(resp => { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return resp; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // Recursos (imágenes, librería): cache-first con actualización en segundo plano.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
        return resp;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
