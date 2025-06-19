// Service Worker for App Status Control
// File: /col/sw.js
// This enables background updates and caching of status

const CACHE_NAME = 'app-status-cache-v2';
const STATUS_URL = 'https://damazinecol.github.io/col/status.json';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache validity
const FALLBACK_RESPONSE = JSON.stringify({
  status: 'normal',
  message: 'التطبيق يعمل بشكل طبيعي',
  lastUpdated: new Date().toISOString()
});

// Install the service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker installed and cache opened');
        // Pre-cache the status file with timestamp
        const timestampedUrl = `${STATUS_URL}?t=${Date.now()}`;
        return fetch(timestampedUrl, {
          cache: 'no-store',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return cache.put(STATUS_URL, response.clone());
        })
        .catch(error => {
          console.log('Pre-cache failed, storing fallback:', error);
          return cache.put(STATUS_URL, new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      })
      .catch(error => {
        console.error('Cache opening failed:', error);
      })
  );
});

// Intercept network requests
self.addEventListener('fetch', (event) => {
  // Only handle requests for our status file
  if (event.request.url.includes('status.json')) {
    event.respondWith(
      (async () => {
        try {
          // First try to get from network
          const networkResponse = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
            cache: 'no-store',
            mode: 'cors',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });

          if (!networkResponse.ok) {
            throw new Error(`HTTP error! status: ${networkResponse.status}`);
          }

          // Clone the response to store in cache
          const responseClone = networkResponse.clone();
          
          // Update cache with fresh response
          const cache = await caches.open(CACHE_NAME);
          await cache.put(STATUS_URL, responseClone);
          
          return networkResponse;
        } catch (networkError) {
          console.log('Network request failed, trying cache:', networkError);
          
          // Try to get from cache
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(STATUS_URL);
          
          if (cachedResponse) {
            // Check if cached data is still valid
            const cachedData = await cachedResponse.clone().json();
            const cachedTime = new Date(cachedData.lastUpdated).getTime();
            
            if (Date.now() - cachedTime < CACHE_TTL) {
              console.log('Returning valid cached response');
              return cachedResponse;
            }
          }
          
          // Return fallback if both network and cache fail
          console.log('Returning fallback response');
          return new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
    return;
  }
  
  // For all other requests, use normal network behavior
  return;
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_STATUS') {
    console.log('Received update message from app');
    // Force immediate update check
    self.registration.update()
      .then(() => {
        console.log('Service Worker updated successfully');
        // Send response back to app
        event.source.postMessage({
          type: 'UPDATE_COMPLETE',
          success: true
        });
      })
      .catch(error => {
        console.error('Update failed:', error);
        event.source.postMessage({
          type: 'UPDATE_COMPLETE',
          success: false,
          error: error.message
        });
      });
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // Claim clients to ensure immediate control
      return self.clients.claim();
    })
  );
});

// Background sync for status updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'status-sync') {
    console.log('Background sync triggered');
    event.waitUntil(
      fetch(STATUS_URL, {
        cache: 'no-store',
        mode: 'cors'
      })
      .then(response => {
        if (!response.ok) throw new Error('Sync fetch failed');
        return response.json();
      })
      .then(data => {
        console.log('Background sync successful');
        // Update all clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'BACKGROUND_UPDATE',
              data: data
            });
          });
        });
      })
      .catch(error => {
        console.error('Background sync failed:', error);
      })
    );
  }
});
