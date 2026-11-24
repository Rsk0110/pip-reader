// Offline support: app shell is cached up front; the AI models are cached the first time they load.
const CACHE = 'pip-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'src/app.js', 'src/ai.js', 'src/reading.js', 'src/sample.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isModel = req.url.includes('/vendor/');
  e.respondWith(
    isModel
      ? caches.match(req).then((hit) => hit || fetch(req).then((res) => (caches.open(CACHE).then((c) => c.put(req, res.clone())), res)))
      : fetch(req)
          .then((res) => (caches.open(CACHE).then((c) => c.put(req, res.clone())), res))
          .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
