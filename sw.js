// Service worker do Guia FAST — deixa o guia instalável no celular.
// Sempre busca a versão mais nova na internet; o que ficou guardado só é usado sem conexão.
// Firebase (dados em tempo real) não passa por aqui.
const CACHE = 'guia-fast-v1';
const BASE = ['./guia-vendedor.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const CDN = ['https://cdnjs.cloudflare.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  const cdn = CDN.some(p => req.url.startsWith(p));
  if (!mesmoSite && !cdn) return;
  if (cdn) { // bibliotecas com versão fixa: guardadas depois da primeira vez
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./guia-vendedor.html'))));
});
