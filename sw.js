const CACHE_NAME = 'fittrack-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
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
.then(response => response || fetch(event.request))
 );
});

self.addEventListener('activate', event => {
 event.waitUntil(
   caches.keys().then(cacheNames => {
     return Promise.all(
       cacheNames.filter(cacheName => {
         return cacheName !== CACHE_NAME;
       }).map(cacheName => {
         return caches.delete(cacheName);
       })
     );
   })
 );
});