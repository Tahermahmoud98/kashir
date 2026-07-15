const CACHE_NAME = 'supermarket-v14';
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
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Exclude API requests and Firebase requests from caching
  if (url.pathname.startsWith('/api/') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      !url.protocol.startsWith('http')) {
    return;
  }

  // Network-First caching strategy
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If response is valid, update cache and return response
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fall back to cache if offline/network fails
        return caches.match(event.request);
      })
  );
});
