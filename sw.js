/* KabuKabu : service worker minimal.
   Les fichiers du site sont mis en cache pour un démarrage rapide et un affichage hors ligne de la coque de l'application.
   Les cartes, la recherche d'adresses et les itinéraires passent toujours par le réseau. */
const CACHE = 'kabukabu-v1';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './assets/logo.svg', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // cartes, polices, itinéraires : réseau uniquement
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
