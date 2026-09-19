/* GoChat PWA Service Worker — shell cache + network-first for app data
   Safe for testing; does not intercept Firebase Auth/Firestore realtime. */
const GC_SW_VERSION = 'gochat-pwa-v1';
const GC_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(GC_SW_VERSION).then((cache) => cache.addAll(GC_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== GC_SW_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isBypass(url) {
  const u = url.href;
  // Never cache auth / live backend / third-party runtimes
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

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Cross-origin: leave to network (no cache)
    return;
  }
  if (isBypass(url)) return;

  // HTML navigations: network-first, fallback to cached shell
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(GC_SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match(req)))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(GC_SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
