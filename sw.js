const CACHE = 'conjugar';
const ASSETS = [
  './', './index.html', './css/style.css',
  './js/data.js', './js/sm2.js', './js/supabase.js', './js/ai.js', './js/app.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => { self.clients.claim(); });

self.addEventListener('fetch', e => {
  if (e.request.url.includes('openrouter.ai') || e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});