// Service Worker for Finchest PWA
const CACHE_NAME = 'finchest-v1';
const STATIC_CACHE = 'finchest-static-v1';
const DATA_CACHE = 'finchest-data-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/add_expense',
    '/add_saving',
    '/expense_report',
    '/saving_report',
    '/static/style.css',
    '/static/logo.png',
    '/static/icon-192.png',
    '/static/icon-512.png',
    '/static/offline.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('Finchest: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => {
                    // Delete old expense-tracker caches and old finchest versions
                    return (name.startsWith('expense-tracker') ||
                        (name.startsWith('finchest') && name !== STATIC_CACHE && name !== DATA_CACHE));
                }).map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle API requests differently
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(event.request));
        return;
    }

    // For GET requests, try cache first, then network
    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // Return cached version and fetch update in background
                        event.waitUntil(
                            fetch(event.request)
                                .then((networkResponse) => {
                                    if (networkResponse.ok) {
                                        caches.open(STATIC_CACHE)
                                            .then((cache) => cache.put(event.request, networkResponse));
                                    }
                                })
                                .catch(() => { })
                        );
                        return cachedResponse;
                    }

                    // Not in cache, fetch from network
                    return fetch(event.request)
                        .then((networkResponse) => {
                            if (networkResponse.ok) {
                                const responseClone = networkResponse.clone();
                                caches.open(STATIC_CACHE)
                                    .then((cache) => cache.put(event.request, responseClone));
                            }
                            return networkResponse;
                        })
                        .catch(() => {
                            // Return offline page if available
                            return caches.match('/');
                        });
                })
        );
    }
});

// Handle API requests with IndexedDB fallback
async function handleApiRequest(request) {
    const url = new URL(request.url);

    try {
        const networkResponse = await fetch(request);

        // Cache successful GET responses
        if (request.method === 'GET' && networkResponse.ok) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(request, networkResponse.clone());

            // Notify clients about stats update for monthly totals
            if (url.pathname === '/api/stats') {
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({ type: 'STATS_UPDATED' });
                });
            }
        }

        return networkResponse;
    } catch (error) {
        // Offline - return cached data for GET requests
        if (request.method === 'GET') {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
        }

        // Return error response
        return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle background sync for offline submissions
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncPendingData());
    }
});

async function syncPendingData() {
    // This will be called when the browser comes back online
    // The actual sync logic is in offline.js
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_COMPLETE' });
    });
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
