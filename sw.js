// Service Worker with Complete CORS Fixes
// File: /col/sw.js
// Version: 4.2
const CACHE_NAME = 'app-status-cache-v4';
const STATUS_URL = 'https://damazinecol.github.io/col/status.json';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const FALLBACK_RESPONSE = JSON.stringify({
  status: 'normal',
  message: 'التطبيق يعمل بشكل طبيعي',
  lastUpdated: new Date().toISOString()
});

// Enhanced Install Event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache opened during install');
        return cache.put(STATUS_URL, new Response(FALLBACK_RESPONSE, {
          headers: { 
            'Content-Type': 'application/json',
            'X-Cache-Status': 'fallback'
          }
        }));
      })
      .catch(error => {
        console.error('[SW] Cache installation failed:', error);
      })
  );
  self.skipWaiting(); // Force active immediately
});

// Robust Fetch Handling with CORS Workarounds
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('status.json')) {
    console.log('[SW] Intercepting status request');
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        
        // Strategy: Cache First with Background Update
        try {
          // 1. Return cached response immediately if valid
          const cachedResponse = await cache.match(STATUS_URL);
          if (cachedResponse) {
            const cachedData = await cachedResponse.clone().json();
            const cachedTime = new Date(cachedData.lastUpdated).getTime();
            
            if (Date.now() - cachedTime < CACHE_TTL) {
              console.log('[SW] Serving valid cached response');
              return cachedResponse;
            }
          }

          // 2. Try to fetch fresh data (with CORS workaround)
          let networkResponse;
          try {
            networkResponse = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
              mode: 'no-cors',
              cache: 'no-store',
              credentials: 'omit'
            });

            // Handle opaque responses (no-cors mode)
            if (networkResponse.type === 'opaque') {
              console.log('[SW] Received opaque response, using as fallback');
              // Update cache in background
              cache.put(STATUS_URL, networkResponse.clone())
                .catch(e => console.log('[SW] Cache update failed:', e));
              return networkResponse;
            }

            if (networkResponse.ok) {
              console.log('[SW] Received valid network response');
              const responseClone = networkResponse.clone();
              await cache.put(STATUS_URL, responseClone);
              return networkResponse;
            }
          } catch (networkError) {
            console.log('[SW] Network fetch failed:', networkError);
          }

          // 3. Final fallback to cached or hardcoded response
          if (cachedResponse) {
            console.log('[SW] Falling back to cached response');
            return cachedResponse;
          }
          
          console.log('[SW] Using hardcoded fallback');
          return new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          });

        } catch (error) {
          console.error('[SW] Fetch handler error:', error);
          return new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
  }
  
  // For all other requests, use network first
  event.respondWith(fetch(event.request));
});

// Enhanced Message Handling
self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_STATUS') {
    console.log('[SW] Received manual update request');
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const response = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
            mode: 'no-cors',
            cache: 'no-store'
          });

          // Even if opaque, try to update cache
          await cache.put(STATUS_URL, response.clone());
          
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'STATUS_UPDATED',
              success: true,
              timestamp: Date.now()
            });
          });
        } catch (error) {
          console.error('[SW] Manual update failed:', error);
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'STATUS_UPDATED',
              success: false,
              error: error.message
            });
          });
        }
      })()
    );
  }
});

// Cache Cleanup on Activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker');
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      console.log('[SW] Clients claimed');
      
      // Clean old caches
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys.map(key => {
          if (key !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    })()
  );
});

// Background Sync for Updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'status-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(STATUS_URL, {
            mode: 'no-cors',
            cache: 'no-store'
          });
          await cache.put(STATUS_URL, response.clone());
          console.log('[SW] Background sync completed');
        } catch (error) {
          console.error('[SW] Background sync failed:', error);
        }
      })()
    );
  }
});

// Periodic Sync (for browsers that support it)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-status-update') {
    console.log('[SW] Periodic update check');
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
            mode: 'no-cors'
          });
          await cache.put(STATUS_URL, response.clone());
        } catch (error) {
          console.log('[SW] Periodic update failed:', error);
        }
      })()
    );
  }
});
