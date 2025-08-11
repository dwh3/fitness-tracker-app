// sw.js - Updated with better cache management
const CACHE_VERSION = 'v19'; // Increment this with each deployment
const CACHE_NAME = `fittrack-${CACHE_VERSION}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  // Force the new service worker to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache, but also update cache from network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('cdn.jsdelivr.net')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // If we have a cached response, serve it but also fetch fresh version
        if (cachedResponse) {
          // Update cache in background
          fetchAndCache(event.request);
          return cachedResponse;
        }
        // Otherwise fetch from network
        return fetchAndCache(event.request);
      })
      .catch(() => {
        // If both cache and network fail, show offline page
        // You could add an offline.html page to handle this
        return new Response('Offline - Unable to fetch resource');
      })
  );
});

// Helper function to fetch and update cache
function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      // Check if valid response
      if (!response || response.status !== 200 || response.type === 'opaque') {
        return response;
      }

      // Clone the response since we need to use it twice
      const responseToCache = response.clone();

      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseToCache);
        });

      return response;
    });
}

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),
      // Delete old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              // Delete caches that don't match current version
              return cacheName.startsWith('fittrack-') && cacheName !== CACHE_NAME;
            })
            .map(cacheName => {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
    ])
  );
});

// Listen for messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'FORCE_UPDATE') {
    // Clear all caches and reload
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
});
