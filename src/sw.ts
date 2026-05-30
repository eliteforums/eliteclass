/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, Route } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare let self: ServiceWorkerGlobalScope;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Precache — build assets injected by vite-plugin-pwa
// ═══════════════════════════════════════════════════════════════════════════════

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Cache First — hashed static assets (JS, CSS, fonts, images)
//    These have content hashes in filenames so they never change.
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) => /\/assets\/.*\.[a-f0-9]{8}\.(js|css|woff2?|png|jpg|svg|webp)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'eliteclass-static-v2',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Stale While Revalidate — translation/locale JSON files
//    Show cached translations immediately while fetching fresh copies.
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) => url.pathname.startsWith('/locales/') && url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({
    cacheName: 'eliteclass-locales-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Cache First — Google Fonts and CDN resources
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.origin === 'https://cdn.jsdelivr.net',
  new CacheFirst({
    cacheName: 'eliteclass-cdn-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cache First — platform images (logo, icons, favicons)
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/favicon.ico',
  new CacheFirst({
    cacheName: 'eliteclass-icons-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Network First — Supabase API requests (with offline fallback to cache)
//    Tries network first with a 5s timeout. Falls back to cached response.
//    This gives offline access to previously loaded data.
//    EXCLUDES auth endpoints — those should never be cached.
// ═══════════════════════════════════════════════════════════════════════════════

// Never cache Supabase auth requests
registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\//.test(url.href),
  new NetworkOnly()
);

registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//.test(url.href),
  new NetworkFirst({
    cacheName: 'eliteclass-api-v2',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Stale While Revalidate — Supabase Storage (uploaded files, logos)
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\//.test(url.href),
  new StaleWhileRevalidate({
    cacheName: 'eliteclass-storage-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Background Sync — queue failed POST/PATCH requests for retry
//    When offline, mutations (messages, attendance marking, etc.) are queued
//    and automatically retried when the connection is restored.
// ═══════════════════════════════════════════════════════════════════════════════

const bgSyncPlugin = new BackgroundSyncPlugin('eliteclass-offline-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
});

// Queue failed Supabase POST/PATCH/DELETE requests for background sync
registerRoute(
  ({ url, request }) =>
    /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//.test(url.href) &&
    ['POST', 'PATCH', 'DELETE'].includes(request.method),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

registerRoute(
  ({ url, request }) =>
    /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//.test(url.href) &&
    request.method === 'PATCH',
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PATCH'
);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Navigation — NetworkFirst for HTML pages
//    Always tries to fetch fresh HTML from the server first.
//    Falls back to cached shell only when offline.
//    This prevents stale auth state from being served to users.
// ═══════════════════════════════════════════════════════════════════════════════

const navigationHandler = new NetworkFirst({
  cacheName: 'eliteclass-pages-v2',
  networkTimeoutSeconds: 3,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
  ],
});

registerRoute(new NavigationRoute(navigationHandler, {
  // Don't cache auth-related URLs at all
  denylist: [/\/auth\/callback/, /\/api\//, /\/auth\/login/, /\/auth\/register/],
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 10. GIPHY API — Stale While Revalidate (for GIF picker)
// ═══════════════════════════════════════════════════════════════════════════════

registerRoute(
  ({ url }) => url.origin === 'https://api.giphy.com',
  new StaleWhileRevalidate({
    cacheName: 'eliteclass-giphy-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Message handlers — Skip Waiting + Clear Auth Cache
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Clear cached pages and API data on logout to prevent stale user data
  if (event.data?.type === 'CLEAR_AUTH_CACHE') {
    caches.delete('eliteclass-pages-v2');
    caches.delete('eliteclass-api-v2');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Activate — claim clients + clean old caches
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old cache versions
      caches.keys().then((cacheNames) => {
        const validCaches = new Set([
          'eliteclass-static-v2',
          'eliteclass-locales-v1',
          'eliteclass-cdn-v1',
          'eliteclass-icons-v1',
          'eliteclass-api-v2',
          'eliteclass-storage-v1',
          'eliteclass-pages-v2',
          'eliteclass-giphy-v1',
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
