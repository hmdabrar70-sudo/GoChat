/* GoChat PWA Service Worker
   - Caches app shell for install / offline chrome
   - Network-first for HTML
   - Never intercepts Firebase / third-party APIs
*/
const GC_SW_VERSION = 'gochat-pwa-v3';
const GC_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(GC_SW_VERSION)
      .then((cache) => cache.addAll(GC_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== GC_SW_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isBypass(url) {
  const u = url.href;
  if (u.includes('firestore.googleapis.com')) return true;
  if (u.includes('firebase')) return true;
  if (u.includes('googleapis.com')) return true;
  if (u.includes('gstatic.com')) return true;
  if (u.includes('cloudinary')) return true;
  if (u.includes('unpkg.com')) return true;
  if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.origin !== self.location.origin) return;
  if (isBypass(url)) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(GC_SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then((r) => r || caches.match('/index.html'))
            .then((r) => r || caches.match('/offline.html'))
            .then((r) => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(GC_SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('/offline.html'));
    })
  );
});
