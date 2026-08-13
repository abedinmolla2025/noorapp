/* Minimal service worker for Web Push notifications */

const CACHE_NAME = 'noor-cache-v' + Date.now();

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear all old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[sw] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = data.title || 'Notification';
  const body = data.body || '';
  const imageUrl = data.image_url || undefined;
  const deepLink = data.deep_link || '/';

  const options = {
    body,
    icon: data.icon || 'https://noorapp.in/notification-icon.png',
    badge: data.badge || 'https://noorapp.in/badge-icon.png',
    data: { deepLink },
    ...(imageUrl ? { image: imageUrl } : {}),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = event.notification?.data?.deepLink || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(deepLink);
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(deepLink);
      }
    })(),
  );
});

// No-op fetch handler removed to ensure the browser always hits the network for the latest version.
// This is critical for avoiding the "MIME type error" caused by stale HTML shells.
