// Service worker: keeps a copy of the app on your phone so it opens without internet.
// Change VERSION whenever you update the app, so phones pick up the new copy.
var VERSION = 'row-tracker-v1';
var APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
var PDF_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js'
];

self.addEventListener('install', function(event){
  event.waitUntil(caches.open(VERSION).then(function(cache){
    return cache.addAll(APP_FILES).then(function(){
      // PDF reader is a bonus: if it can't be saved now, it's saved the first time you open a PDF.
      return Promise.all(PDF_FILES.map(function(u){ return cache.add(new Request(u, { mode: 'cors' })).catch(function(){}); }));
    });
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(event){
  event.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

// Show the saved copy straight away, and quietly fetch a fresh one for next time.
self.addEventListener('fetch', function(event){
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.open(VERSION).then(function(cache){
    return cache.match(event.request, { ignoreSearch: true }).then(function(saved){
      var fresh = fetch(event.request).then(function(res){
        if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
        return res;
      }).catch(function(){ return saved; });
      return saved || fresh;
    });
  }));
});
