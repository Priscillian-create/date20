// service-worker.js
const CACHE_NAME = 'pagerrysmart-pos-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/script.js',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// Install event - open a cache and add all the essential files to it
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Failed to cache resources:', error);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // If the request is in cache, return it
        if (response) {
          return response;
        }
        
        // If not in cache, try to fetch from network
        return fetch(event.request)
          .catch(error => {
            // If network fails, you could return a custom offline page
            console.error('Network request failed:', error);
            
            // Only return cached fallback for HTML requests
            if (event.request.destination === 'document') {
              return caches.match('/');
            }
            
            // For other requests, just fail gracefully
            return new Response('Network error occurred', { 
              status: 408, 
              statusText: 'Request Timeout' 
            });
          });
      })
      .catch(error => {
        console.error('Cache match failed:', error);
        return fetch(event.request);
      })
  );
});

// Activate event - remove old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});