// Service Worker — cache offline
const CACHE = 'conjugar-v2';
const ASSETS = ['./', './index.html', './css/style.css', './js/data.js', './js/sm2.js', './js/ai.js', './js/app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
