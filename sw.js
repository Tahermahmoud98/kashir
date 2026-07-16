const CACHE_NAME = 'supermarket-v15';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './styles.css',
  './pcs_styles.css',
  './claymorphism.css',
  './db.js',
  './kbd.js',
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

  // Exclude API requests and Firebase/Google API requests from caching
  if (url.pathname.startsWith('/api/') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      !url.protocol.startsWith('http')) {
    return;
  }

  // Stale-While-Revalidate caching strategy for local POS assets
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Ignore network fetch errors if offline
        });
        
        // Return cached response instantly if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});

