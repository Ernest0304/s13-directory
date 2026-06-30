/* =============================================================================
 * sw.js — offline shell for the S13 directory board.
 *
 * Goal: an UNATTENDED kiosk that opens with ZERO internet and survives reboots.
 * After the device has loaded the board online once, the app shell + the last
 * good content/logos are cached here, so a power-loss / network-drop / reboot
 * still brings the full board back up from cache.
 *
 * Pathing: registered as a RELATIVE path ('./sw.js') so this file is portable —
 * it works the same on the local preview and on the final live host. Nothing in
 * here hard-codes the kiosk's URL.
 *
 * UPDATE DISCIPLINE: when you change ANY precached shell file (index.html,
 * css/styles.css, any js/*.js, img/logo.png, the manifest), bump SW_VERSION
 * below by one. That is what ships the change to an already-deployed kiosk:
 * the new worker re-fetches the shell and the old cache is purged on activate.
 * (Keep bumping ?v=N in index.html too — it busts the HTTP/CDN layer.)
 * ========================================================================== */

const SW_VERSION = "s13-v3";
const PRECACHE = "s13-precache-" + SW_VERSION; // app shell, purged on version bump
const RUNTIME  = "s13-runtime";                // live content + logos, kept across updates

/* App shell — bare (un-versioned) paths. cache-first uses ignoreSearch:true so a
 * request for `css/styles.css?v=14` still matches the precached `css/styles.css`. */
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/config.js",
  "js/data.js",
  "js/db.js",
  "js/map.js",
  "js/app.js",
  "img/logo.png",
  "img/icon-192.png",
  "img/icon-512.png",
];

/* ---------- install: warm the shell, take over immediately ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // {cache:'reload'} bypasses the HTTP cache so we precache the freshest copy
      cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" })))
    ).then(() => self.skipWaiting())
  );
});

/* ---------- activate: drop stale precaches, keep runtime ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("s13-precache-") && k !== PRECACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- helpers ---------- */
const isSupabaseRest    = (u) => u.pathname.startsWith("/rest/v1/");
const isSupabaseStorage = (u) => u.pathname.startsWith("/storage/v1/object/public/");

// network-first: fresh when online, cached when not (for HTML + live content)
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

// cache-first (ignoreSearch) for immutable, ?v=N-versioned shell assets
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, res.clone());
  }
  return res;
}

// stale-while-revalidate for logos/ad images: instant from cache, refresh in bg
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await fetching) || Response.error();
}

/* ---------- route every GET ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // logins / saves / uploads go straight to network

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    if (request.mode === "navigate") {
      // boot / reload: fresh page online, cached shell offline
      event.respondWith(
        networkFirst(request, PRECACHE).catch(() =>
          caches.match("index.html", { ignoreSearch: true }).then(
            (r) => r || caches.match("./")
          )
        )
      );
    } else {
      // css / js / img — versioned, safe to serve from cache first
      event.respondWith(cacheFirst(request));
    }
    return;
  }

  // cross-origin = Supabase
  if (isSupabaseRest(url)) {
    event.respondWith(networkFirst(request, RUNTIME));
  } else if (isSupabaseStorage(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // any other cross-origin GET: leave it to the network (don't intercept)
});
