// 🚀 Self-Destructing Service Worker (ক্যাশ এবং অফলাইন মোড ধ্বংস করার জন্য)

self.addEventListener('install', (e) => {
  self.skipWaiting(); // নতুন ভার্সন এলে সাথে সাথে অ্যাকটিভ হবে
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // পুরনো সব ক্যাশ ডিলিট করে দেবে
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      self.clients.claim();
      // নিজেকে নিজে আনরেজিস্টার করে ফেলবে
      self.registration.unregister().then(() => {
        console.log('Service Worker has been destroyed!');
      });
    })
  );
});

