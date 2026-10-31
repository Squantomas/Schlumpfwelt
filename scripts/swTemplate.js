/*
 * Service Worker der Web-App – Vorlage. `scripts/pwaPlugin.mjs` ersetzt beim Build die zwei Platzhalter unten
 * (Version und Dateiliste) und schreibt das Ergebnis als `sw.js` nach dist/.
 *
 * Idee: Beim Installieren landen alle Dateien des Spiels in einem Cache (Name mit Versions-Hash). Danach kommen
 * Antworten zuerst aus dem Cache – das Spiel startet auch ohne Netz. Eine neue Version des Spiels bringt einen
 * neuen Hash: Der neue Worker legt seinen eigenen Cache an, übernimmt und räumt die alten Caches weg. Die Seite
 * zeigt die neue Version beim nächsten Laden. Kein Netz außer der eigenen Adresse, kein Tracking.
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE_PREFIX = 'village-';
const CACHE = CACHE_PREFIX + VERSION;

/** The address of the game (the scope of this worker), always with a trailing slash. */
const scopeUrl = () => new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload`: the files come from the server, not from an older copy in the browser's own cache.
      await cache.addAll(FILES.map((file) => new Request(new URL(file, scopeUrl()).href, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  const scope = scopeUrl();
  // Only our own files: other addresses (there should be none) go straight to the network.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
    return;
  }
  event.respondWith(answer(request, scope));
});

async function answer(request, scope) {
  const cache = await caches.open(CACHE);
  // `?seed=1&save=1` and the like do not make another file.
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }
  try {
    return await fetch(request);
  } catch (error) {
    // Offline and not in the cache: a page request gets the game itself.
    if (request.mode === 'navigate') {
      const index = await cache.match(new URL('index.html', scope).href);
      if (index) {
        return index;
      }
    }
    throw error;
  }
}
