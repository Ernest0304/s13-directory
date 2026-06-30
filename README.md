# Smart City Kitchens — S13 Kitchen Directory Board

A 24/7 unattended **touchscreen wayfinding directory** for **Smart City Kitchens S13**
(JTC Bedok Food City, 1550 Bedok North Ave 4, #04-21, Singapore 489950). Customers and
delivery riders tap to find a kitchen brand and see the route from "You Are Here".

Vanilla **HTML / CSS / JS** — no build step. Content is served from **Supabase** (with a
local cache + bundled fallback) and managed remotely via the admin page.

## Run locally
Any static file server from the project root, e.g.:

```bash
python3 -m http.server 8137
# open http://localhost:8137
```

The service worker only registers over **HTTPS or localhost** (not `file://`).

## Offline shell (PWA)
`sw.js` + `manifest.webmanifest` make the board offline-capable: after one online load
the app shell, last-good content, and tenant logos are cached, so a network drop, power
cut, or reboot still brings the full board back up.

**Update rule:** when you change any precached shell file (`index.html`, `css/styles.css`,
any `js/*.js`, `img/logo.png`, the manifest), bump `SW_VERSION` in `sw.js` by one — that
ships the change to an already-deployed kiosk (the old cache is purged on activate). Keep
bumping `?v=N` in `index.html` too.

## Deploy
Any static HTTPS host works (the app uses relative paths, so a sub-path is fine). The only
URL-dependent piece is the kiosk browser's Start URL, set last.

## Structure
- `index.html` — the board · `admin.html` — content CMS (Supabase Auth login)
- `js/` — `config` (Supabase keys) · `data` (seed + i18n) · `db` (REST + cache) · `map`
  (floor-plan SVG) · `app` (UI) · `admin`
- `css/` · `img/` · `sw.js` · `manifest.webmanifest`

Config note: `js/config.js` holds the Supabase **anon** key only — public read-only by
design. No service-role secret is committed.
