const CACHE_NAME = 'gochat-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

// ১. ফাইলগুলো ক্যাশ (Cache) করা
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// ২. পুরনো ক্যাশ ডিলিট করে নতুন আপডেট দেওয়া
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ৩. অফলাইন মোডে ক্যাশ থেকে ফাইল দেখানো
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // ক্যাশে থাকলে সেটা দেখাবে, না থাকলে ইন্টারনেট থেকে আনবে
        return response || fetch(event.request);
      })
  );
});
