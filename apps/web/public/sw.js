// CoinGist service worker: makes the site installable and readable on a weak connection.
// Pages always come from the network first, so readers never see stale news while online.
// When offline, the last copy of a page they opened is shown, or a short offline notice.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const MAX_PAGES = 30;
// Personal pages are never stored on the device.
const PRIVATE = /^\/(account|for-you|engagement|go\/)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're offline | CoinGist</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1B1F5E;color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
b{color:#FFC72C}a{display:inline-block;margin-top:16px;background:#FFC72C;color:#1B1F5E;padding:10px 20px;border-radius:999px;font-weight:700;text-decoration:none}</style>
<main><p><b>CoinGist</b></p><h1>You're offline</h1><p>Check your connection. Stories you opened recently are still available.</p><a href="/">Try again</a></main></html>`;

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (PRIVATE.test(url.pathname)) return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          const cc = res.headers.get("Cache-Control") || "";
          if (res.ok && !/private|no-store/.test(cc)) {
            const copy = res.clone();
            event.waitUntil(caches.open(PAGES).then((c) => c.put(req, copy).then(() => trim(c))));
          }
          return res;
        })
        .catch(async () =>
          (await caches.match(req, { cacheName: PAGES })) ||
          new Response(OFFLINE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })),
    );
    return;
  }

  // Build files have hashed names and never change: serve from the device once stored.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/coins/")) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
  }
});
