const CACHE = 'da-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './Domasnav2/style.css',
  './Domasnav2/app.js',
  './Domasnav2/domasna_apteka/back_photo_index.jpg',
  './Domasnav2/domasna_apteka/domasna_apteka_logo_crno.jpg',
  './Domasnav2/domasna_apteka/domasna_apteka_zeleno_logo.jpg',
  './Domasnav2/domasna_apteka/Oreovka.jpg',
  './Domasnav2/domasna_apteka/visnovka.jpg',
  './Domasnav2/domasna_apteka/cresovka.jpg',
  './Domasnav2/domasna_apteka/med_gluvarce.jpg',
  './Domasnav2/domasna_apteka/Nazdravje.jpg',
  './Domasnav2/domasna_apteka/GiveAway.jpg',
  './Domasnav2/domasna_apteka/medgluvarce_planina.jpg',
  './Domasnav2/domasna_apteka/DSC_0210.JPG',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Always pass API calls through — never cache or intercept them
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('emailjs.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached); // return cached on network fail
      return cached || network;
    })
  );
});
