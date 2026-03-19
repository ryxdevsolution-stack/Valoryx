/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

declare let self: ServiceWorkerGlobalScope

// Precache all assets injected by vite-plugin-pwa at build time
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ─── Offline fallback for navigation requests ───
const OFFLINE_PAGE = '/offline.html'

// Navigation: try network first, fall back to cache
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'pages-cache',
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  ),
)

// Global catch handler: serve offline page when navigation fails
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    // Try to find offline.html in any cache
    const allCacheNames = await caches.keys()
    for (const name of allCacheNames) {
      const cache = await caches.open(name)
      const offlineResponse = await cache.match(OFFLINE_PAGE)
      if (offlineResponse) return offlineResponse
    }
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
  return Response.error()
})

// ─── API caching: NetworkFirst for GET requests only ───
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  }),
  'GET',
)

// ─── Static assets: CacheFirst ───
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new CacheFirst({
    cacheName: 'assets-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)

// ─── Fonts: CacheFirst (long TTL) ───
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
)

// ─── Images: StaleWhileRevalidate ───
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)

// ─── Background Sync: Queue offline bill submissions ───
const billSyncPlugin = new BackgroundSyncPlugin('offline-bills-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request.clone())
        // Notify the app that a queued bill was synced
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.postMessage({
            type: 'BILL_SYNCED',
            url: entry.request.url,
            timestamp: Date.now(),
          })
        }
      } catch (error) {
        await queue.unshiftRequest(entry)
        throw error // Let Workbox retry later
      }
    }
  },
})

// Intercept bill creation POST requests for background sync
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    (url.pathname.includes('/bills') || url.pathname.includes('/billing')) &&
    request.method === 'POST',
  new NetworkFirst({
    cacheName: 'bill-submissions',
    plugins: [billSyncPlugin],
  }),
  'POST',
)

// ─── SW lifecycle: skip waiting on message ───
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
