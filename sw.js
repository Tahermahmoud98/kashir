const CACHE_NAME = 'supermarket-v10';
const ASSETS = [
  './index.html',
  './admin.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './firebase-sync.js',
  './translations.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.ico',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
