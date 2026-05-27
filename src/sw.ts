/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// Precache build assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Cache First for hashed static assets
registerRoute(
  ({ url }) => /\/assets\/.*\.[a-f0-9]{8}\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'eliteclass-static-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Stale While Revalidate for HTML navigation
registerRoute(
  new NavigationRoute(
    new StaleWhileRevalidate({
      cacheName: 'eliteclass-documents-v1',
    })
  )
);

// Network First for Supabase API GET requests
registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//.test(url.href),
  new NetworkFirst({
    cacheName: 'eliteclass-api-v1',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 86400,
      }),
    ],
  })
);

// Skip waiting when prompted by client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Claim clients immediately on activate + clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        const validCaches = new Set([
          'eliteclass-static-v1',
          'eliteclass-documents-v1',
          'eliteclass-api-v1',
        ]);
        return Promise.all(
          cacheNames
            .filter((name) => !validCaches.has(name) && !name.startsWith('workbox-'))
            .map((name) => caches.delete(name))
        );
      }),
    ])
  );
});
