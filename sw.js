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
 * Both boards are in the shell: index-3d.html (the one the wall screen opens) with
 * its 3D map script and the bundled three.js, and the older index.html.
 *
 * UPDATE DISCIPLINE: when you change ANY precached shell file (index-3d.html,
 * index.html, css/styles.css, any js/*.js, vendor/three/*, img/logo.png, the
 * manifest), bump SW_VERSION
 * below by one. That is what ships the change to an already-deployed kiosk:
 * the new worker re-fetches the shell and the old cache is purged on activate.
 * (Keep bumping ?v=N in index.html too — it busts the HTTP/CDN layer.)
 * ========================================================================== */

const SW_VERSION = "s13-v33";
const PRECACHE = "s13-precache-" + SW_VERSION; // app shell, purged on version bump
const RUNTIME  = "s13-runtime";                // live content + logos, kept across updates

/* App shell — bare (un-versioned) paths: the last-resort copy for an offline start (a request
 * for `css/styles.css?v=14` falls back to the precached `css/styles.css` via ignoreSearch). */
const APP_SHELL = [
  "./",
  "index.html",
  "index-3d.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/config.js",
  "js/data.js",
  "js/db.js",
  "js/map.js",
  "js/map3d.js",
  "js/app.js",
  "vendor/three/three.module.js",
  "vendor/three/addons/controls/OrbitControls.js",
  "vendor/three/addons/geometries/RoundedBoxGeometry.js",
  "vendor/three/addons/renderers/CSS2DRenderer.js",
  "img/logo.png",
  "img/icon-192.png",
  "img/icon-512.png",
];

/* ---------- install: warm the shell, take over immediately ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // {cache:'reload'} bypasses the HTTP cache so we precache the freshest copy
    await cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" })));
    // ...and the exact versioned URLs the two boards ask for (css/styles.css?v=25 ...), taken
    // from the pages just saved: an offline or slow start then finds the very versions it needs
    const wanted = new Set();
    for (const page of ["index-3d.html", "index.html"]) {
      const res = await cache.match(page); if (!res) continue;
      for (const m of (await res.text()).matchAll(/(?:src|href)="([^"?#]+\?v=[^"#]+)"/g)) wanted.add(m[1]);
    }
    await cache.addAll([...wanted].map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

/* ---------- activate: drop stale precaches, and this site's old versioned files ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("s13-precache-") && k !== PRECACHE).map((k) => caches.delete(k)));
    // a new worker means a new deploy: the page's own files saved under ?v=N by the old one are
    // stale; database answers and logos (other origins) are kept for offline starts
    const rt = await caches.open(RUNTIME);
    for (const req of await rt.keys()) if (new URL(req.url).origin === self.location.origin) await rt.delete(req);
    await self.clients.claim();
  })());
});

/* ---------- helpers ---------- */
const isSupabaseRest    = (u) => u.pathname.startsWith("/rest/v1/");
const isSupabaseStorage = (u) => u.pathname.startsWith("/storage/v1/object/public/");
const TIMEOUT_MS = 4000;

/* Network first, with a time limit. Whenever the network answers within a few seconds the
 * board gets the fresh file, saved under its exact URL (with ?v=N) — so a page and its
 * scripts always come from the same deploy (the old cache-first rule could pair a new page
 * with old scripts until the worker updated). With no answer in time, or no network, it gets
 * the copy saved last time; the precached shell is the last resort. */
async function fresh(request, cacheName) {
  const cache = await caches.open(cacheName);
  const net = fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; });
  net.catch(() => {});                                   // a late failure after the timeout is not an error
  try {
    const res = await Promise.race([net, new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS, null))]);
    if (res) return res;
  } catch (e) { /* offline: use a saved copy */ }
  const saved = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
  return saved || net;                                   // nothing saved: wait for the network after all
}

/* A file asked for with a version (styles.css?v=25) never changes under that URL, so the copy
 * saved for exactly that URL is used straight away — which also keeps a slow network from
 * delaying every script by the time limit. Anything not saved yet goes to the network. */
async function versioned(request) {
  return (await caches.match(request)) || fresh(request, RUNTIME);
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
  // logins / saves / uploads, and the admin page's no-store reads, go straight to the network
  if (request.method !== "GET" || request.cache === "no-store") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    // pages and unversioned files: fresh when online, the saved copy when not;
    // versioned files (?v=N): the saved copy of exactly that version first
    if (request.mode === "navigate") event.respondWith(fresh(request, PRECACHE));
    else if (url.search) event.respondWith(versioned(request));
    else event.respondWith(fresh(request, RUNTIME));
    return;
  }

  // cross-origin = Supabase
  if (isSupabaseRest(url)) {
    event.respondWith(fresh(request, RUNTIME));
  } else if (isSupabaseStorage(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // any other cross-origin GET: leave it to the network (don't intercept)
});
