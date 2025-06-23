// Service Worker for App Status Control - Full Version
// File: /col/sw.js
// Version: 3.0
// Last Updated: 2024-06-20

const CACHE_NAME = 'app-status-cache-v3';
const STATUS_URL = 'https://damazinecol.github.io/col/status.json';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache validity
const FALLBACK_RESPONSE = JSON.stringify({
  status: 'normal',
  message: 'التطبيق يعمل بشكل طبيعي',
  lastUpdated: new Date().toISOString()
});

// Install the service worker with enhanced caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Cache opened during install');
        
        // Pre-cache with network-first strategy
        return fetch(STATUS_URL, {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
        .then(networkResponse => {
          if (networkResponse.ok) {
            console.log('[Service Worker] Successfully fetched status during install');
            return cache.put(STATUS_URL, networkResponse.clone());
          }
          throw new Error('Network response not OK');
        })
        .catch(error => {
          console.log('[Service Worker] Install fetch failed, caching fallback:', error);
          return cache.put(STATUS_URL, new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      })
      .catch(error => {
        console.error('[Service Worker] Cache opening failed:', error);
      })
  );
});

// Enhanced fetch handling with multiple fallbacks
self.addEventListener('fetch', (event) => {
  // Only intercept requests for our status file
  if (event.request.url.includes('status.json')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cacheMatch = await cache.match(STATUS_URL);
        
        // Network-first strategy with cache fallback
        try {
          // Try to fetch from network
          const networkResponse = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });

          // Validate response
          if (!networkResponse.ok) {
            throw new Error(`HTTP error! status: ${networkResponse.status}`);
          }

          // Clone the response to store in cache
          const responseClone = networkResponse.clone();
          
          // Update cache with fresh response
          await cache.put(STATUS_URL, responseClone);
          console.log('[Service Worker] Served fresh network response');
          
          return networkResponse;
        } catch (networkError) {
          console.log('[Service Worker] Network request failed, trying cache:', networkError);
          
          // Try to get from cache if available
          if (cacheMatch) {
            const cachedData = await cacheMatch.clone().json();
            const cachedTime = new Date(cachedData.lastUpdated).getTime();
            
            // Check if cached data is still valid
            if (Date.now() - cachedTime < CACHE_TTL) {
              console.log('[Service Worker] Serving valid cached response');
              return cacheMatch;
            }
          }
          
          // Ultimate fallback
          console.log('[Service Worker] Serving fallback response');
          return new Response(FALLBACK_RESPONSE, {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
    return;
  }
  
  // For all other requests, use default network behavior
  return fetch(event.request);
});

// Handle messages from the app for manual updates
self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_STATUS') {
    console.log('[Service Worker] Received manual update request');
    
    event.waitUntil(
      (async () => {
        try {
          // Force update check
          const response = await fetch(`${STATUS_URL}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) throw new Error('Update fetch failed');
          
          const data = await response.json();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(STATUS_URL, response.clone());
          
          // Notify all clients
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'STATUS_UPDATED',
              data: data,
              timestamp: Date.now()
            });
          });
          
          event.source.postMessage({
            type: 'UPDATE_COMPLETE',
            success: true
          });
        } catch (error) {
          console.error('[Service Worker] Manual update failed:', error);
          event.source.postMessage({
            type: 'UPDATE_COMPLETE',
            success: false,
            error: error.message
          });
        }
      })()
    );
  }
});

// Clean up old caches during activation
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated');
  
  event.waitUntil(
    (async () => {
      // Clean old caches
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys.map(key => {
          if (key !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
      
      // Immediately claim clients
      await self.clients.claim();
      console.log('[Service Worker] Clients claimed');
    })()
  );
});

// Background sync for periodic updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'status-sync') {
    console.log('[Service Worker] Background sync triggered');
    
    event.waitUntil(
      (async () => {
        try {
          const response = await fetch(STATUS_URL, {
            cache: 'no-store',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) throw new Error('Sync fetch failed');
          
          const data = await response.json();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(STATUS_URL, response.clone());
          
          // Notify all clients
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'BACKGROUND_UPDATE',
              data: data,
              timestamp: Date.now()
            });
          });
          
          console.log('[Service Worker] Background sync completed successfully');
        } catch (error) {
          console.error('[Service Worker] Background sync failed:', error);
        }
      })()
    );
  }
});

// Periodic update check (every 6 hours)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-status-update') {
    console.log('[Service Worker] Periodic update check');
    event.waitUntil(
      fetch(STATUS_URL, {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })
      .then(response => {
        if (!response.ok) throw new Error('Periodic fetch failed');
        return response.json();
      })
      .then(data => {
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(STATUS_URL, new Response(JSON.stringify(data))));
      })
      .catch(error => {
        console.error('[Service Worker] Periodic update failed:', error);
      })
    );
  }
});
