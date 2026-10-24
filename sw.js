// Service worker: guarda la app para que abra rápido y sin conexión.
// Cambia VERSION en cada actualización; los datos (IndexedDB) no se tocan.
const VERSION = 'mi-ingles-v1.2.3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/db.js', 'js/srs.js', 'js/curriculum.js', 'js/gemini.js', 'js/voice.js',
  'js/tutor.js', 'js/ui.js', 'js/mic.js', 'js/onboarding.js', 'js/session.js', 'js/screens.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Las llamadas a Gemini y ElevenLabs nunca se guardan en caché.
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
