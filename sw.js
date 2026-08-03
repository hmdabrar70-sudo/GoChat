const CACHE_NAME = 'gochat-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'syncMessages') {
    event.waitUntil(syncPendingData());
  }
});
