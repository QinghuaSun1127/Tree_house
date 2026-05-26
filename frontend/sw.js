const CACHE_NAME = 'treehole-static-v20260526-3';

const PRECACHE_URLS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './config.example.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

function isApiRequest(url) {
    return url.pathname.startsWith('/api/') || url.hostname.includes('.hf.space');
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (isApiRequest(url)) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || networkFetch;
        })
    );
});
