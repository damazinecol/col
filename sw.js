// Service Worker for App Status Control
// File: /col/sw.js
// This enables background updates and caching of status

const CACHE_NAME = 'app-status-cache-v1';
const STATUS_URL = 'https://damazinecol.github.io/col/status.json';

// Install the service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Pre-cache the status file
        return cache.add(STATUS_URL)
          .catch(err => console.log('Pre-cache failed:', err));
      })
  );
});

// Intercept network requests
self.addEventListener('fetch', (event) => {
  // Only handle requests for our status file
  if (event.request.url.includes(STATUS_URL)) {
    event.respondWith(
      // Try network first
      fetch(event.request)
        .then(response => {
          // Clone the response to store in cache
          const responseClone = response.clone();
          
          // Update cache with fresh response
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone));
            
          return response;
        })
        .catch(() => {
          // Fallback to cached version if network fails
          return caches.match(event.request)
            .then(cached => cached || new Response(JSON.stringify({
              status: 'normal',
              message: 'التطبيق يعمل بشكل طبيعي',
              lastUpdated: new Date().toISOString()
            }), {
              headers: { 'Content-Type': 'application/json' }
            }));
        })
    );
  }
  
  // For all other requests, use normal network behavior
  return;
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_STATUS') {
    // Force immediate update check
    self.registration.update();
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
