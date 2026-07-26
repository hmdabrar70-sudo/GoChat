// ==========================================
// 🚀 1. FIREBASE BACKGROUND NOTIFICATION SETUP
// ==========================================

// ফায়ারবেসের লাইব্রেরিগুলো ইমপোর্ট করা হচ্ছে (আপনার index.html এর ভার্সন অনুযায়ী)
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// আপনার অ্যাপের ফায়ারবেস কনফিগারেশন
firebase.initializeApp({
  apiKey: "AIzaSyAnKueAHG8cw6O-Hy8U9fgGzH4fDMYQBy8",
  authDomain: "gochat-3efa3.firebaseapp.com",
  projectId: "gochat-3efa3",
  storageBucket: "gochat-3efa3.firebasestorage.app",
  messagingSenderId: "203332487017",
  appId: "1:203332487017:web:06af0b8b4b12af89581ff8"
});

const messaging = firebase.messaging();

// অ্যাপ ব্যাকগ্রাউন্ডে বা বন্ধ থাকলে এই ফাংশনটি নোটিফিকেশন রিসিভ করবে
messaging.onBackgroundMessage(function(payload) {
  console.log('Background Message Received: ', payload);

  const notificationTitle = payload.notification ? payload.notification.title : 'New Notification';
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : 'You have a new message on GoChat.',
    icon: '/icon.png', // আপনার অ্যাপের আইকন (manifest.json এ যে আইকন দিয়েছেন)
    badge: '/icon.png',
    vibrate: [200, 100, 200, 100, 200, 100, 200], // কল বা মেসেজ আসলে ফোন ভাইব্রেট করবে
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// নোটিফিকেশনে ক্লিক করলে যেন অ্যাপটি ওপেন হয় তার লজিক
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // অ্যাপটি যদি মিনিমাইজ করা থাকে, তাহলে সেটাকে সামনে আনবে
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf('/') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      // অ্যাপ যদি পুরোপুরি বন্ধ থাকে, তাহলে নতুন করে ওপেন করবে
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});


// ==========================================
// 🚀 2. OFFLINE CACHING SYSTEM (আপনার পুরনো কোড)
// ==========================================

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
