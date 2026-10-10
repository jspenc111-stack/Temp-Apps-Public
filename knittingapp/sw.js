// Service worker: keeps a copy of the app on the phone so it opens without internet.
// Bump VERSION on every change to the app, so installed copies pick up the new files.
const VERSION = 'row-tracker-v2';
const OURS = 'row-tracker-';                 // every cache this app owns starts with this
const SHARED = 'row-tracker-shared';         // holds a file shared into the app, until the app opens it
const SHARED_FILE = './shared-pattern';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './pattern.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  // "reload" fetches each file fresh from the website, not from the browser's short-term memory,
  // so a new version never saves an old copy of a file by mistake.
  const fresh = APP_FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()),
  );
});

// Clear out this app's old copies. Fishbowl and Counter live at the same web address
// and keep their own caches there, so only names starting with "row-tracker-" are touched.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(OURS) && name !== VERSION && name !== SHARED)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; // not this app's file

  // A pattern file shared into the app from Android's share menu.
  if (request.method === 'POST' && url.pathname === new URL('./share', scope).pathname) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  // Show the saved copy straight away, and quietly fetch a fresh one for next time.
  event.respondWith(
    caches.open(VERSION).then((cache) => cache.match(request, { ignoreSearch: true }).then((saved) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
          return response;
        })
        .catch(() => saved || new Response('Row Tracker is offline and this file has not been saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
      if (saved) { event.waitUntil(fresh); return saved; }
      return fresh;
    })),
  );
});

// Keep the shared file's text on the phone (never sent anywhere), then open the app,
// which reads it, checks it like any other file, and removes it.
async function receiveShare(request) {
  const home = new URL('./', self.registration.scope);
  try {
    const form = await request.formData();
    const file = form.get('pattern');
    const shared = { name: '', type: '', size: 0, text: '' };
    if (file && typeof file === 'object' && typeof file.text === 'function') {
      shared.name = file.name || '';
      shared.type = file.type || '';
      shared.size = file.size;
      // Anything over 2 MB is too big to be a pattern file, so its contents aren't kept; the app says why.
      if (file.size <= 2 * 1024 * 1024) shared.text = await file.text();
    } else {
      shared.text = String(form.get('text') || '').slice(0, 2 * 1024 * 1024);
    }
    const cache = await caches.open(SHARED);
    await cache.put(SHARED_FILE, new Response(JSON.stringify(shared), { headers: { 'Content-Type': 'application/json' } }));
    home.search = '?shared=1';
  } catch (e) {
    home.search = '?shared=failed';
  }
  return Response.redirect(home.href, 303);
}
