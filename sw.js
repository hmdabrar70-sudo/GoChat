const CACHE_NAME = 'gochat-v1';
const urlsToCache = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://unpkg.com/@phosphor-icons/web'
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
        // যদি ক্যাশে থাকে, তাহলে ক্যাশ থেকে দেবে
        if (response) return response;
        // না থাকলে ইন্টারনেট থেকে নেওয়ার চেষ্টা করবে
        return fetch(event.request).catch(() => {
            console.log('Offline: Resource not available');
        });
      })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'syncMessages') {
    event.waitUntil(syncPendingData());
  }
});
