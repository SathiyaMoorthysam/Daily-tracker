/* HabitOS v3 — Service Worker (cache busted for Firebase migration) */
const CACHE    = 'habitos-v3-cache';
const PRECACHE = [
  './',
  './index.html',
  './login.html',
  './styles.css',
  './app.js',
  './api.js',
  './analytics.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  /* Never cache: Firebase Auth/Firestore requests, Google APIs, CDN SDKs */
  if (url.includes('googleapis.com')         ||
      url.includes('gstatic.com/firebasejs') ||
      url.includes('firebaseapp.com')        ||
      url.includes('firebaseio.com')         ||
      url.includes('script.google.com')) {
    return; // let the browser handle it directly
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
