const CACHE_VERSION = "v1";
const CACHE_NAME = `cache-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/styles.css",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
  "/android-chrome-512x512.png",
  "/android-chrome-192x192.png",
  "/mstile-150x150.png",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("Opened cache:", CACHE_NAME);

        // Instead of cache.addAll(), cache each resource individually
        // so that failure of one resource doesn't fail the entire process
        return Promise.allSettled(
          STATIC_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url);
              if (!response.ok) {
                throw new Error(`Failed to fetch ${url}`);
              }
              return await cache.put(url, response);
            } catch (error) {
              console.error(`Failed to cache: ${url}`, error);
              return await Promise.resolve();
            }
          }),
        );
      })
      .then(() => self.skipWaiting()), // Force the waiting service worker to become active
  );
});

// Fetch event - handle resource requests
self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  // For navigation requests (HTML pages), use network-first approach
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request);
        }),
    );
    return;
  }

  // For other GET requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response and update cache in background
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  })
                  .catch((error) => {
                    console.error("Failed to update cache:", error);
                  });
              }
              return networkResponse;
            })
            .catch(() => {
              // Silent catch to prevent errors when updating cache in background
            });

          // Fire and forget cache update
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch((error) => {
                console.error("Failed to cache response:", error);
              });

            return networkResponse;
          })
          .catch((error) => {
            console.error("Network error:", error);
            // Return custom offline response
            return new Response("Network error occurred. Please try again later.", {
              status: 503,
              statusText: "Service Unavailable",
              headers: new Headers({ "Content-Type": "text/plain" }),
            });
          });
      }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheWhitelist.includes(cacheName)) {
              console.log("Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          }),
        );
      })
      .then(() => {
        // Take control of all clients as soon as the service worker activates
        return self.clients.claim();
      }),
  );
});
