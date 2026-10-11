/* GoChat offline shell · v1 */
const CACHE = 'gc-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  'https://unpkg.com/@phosphor-icons/web',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL.map(function(u) {
        try { return new Request(u, { mode: 'no-cors' }); } catch (e) { return u; }
      })).catch(function() {
        return Promise.all(SHELL.map(function(u) {
          return cache.add(u).catch(function(){ return null; });
        }));
      });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // App navigation / same-origin documents: network first, fall back to cache
  if (req.mode === 'navigate' || (url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('.html')))) {
    event.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || caches.match('/index.html') || caches.match('/');
        });
      })
    );
    return;
  }

  // Static / CDN: cache first, then network
  if (
    url.hostname.indexOf('gstatic.com') !== -1 ||
    url.hostname.indexOf('unpkg.com') !== -1 ||
    url.hostname.indexOf('fonts.googleapis.com') !== -1 ||
    url.hostname.indexOf('fonts.gstatic.com') !== -1 ||
    url.pathname.match(/\.(js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/i)
  ) {
    event.respondWith(
      caches.match(req).then(function(hit) {
        if (hit) return hit;
        return fetch(req).then(function(res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function(c){ c.put(req, copy); });
          }
          return res;
        }).catch(function(){ return hit; });
      })
    );
  }
});
