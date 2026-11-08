// PS Spinz. Cache names start with "spz-" and only "spz-" caches are ever cleaned up,
// so this never touches the caches of other apps on the same site.
const SHELL = "spz-shell-v3";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "css/spinz.css", "js/app.js",
  "icons/ps-icon-192.png", "icons/ps-icon-512.png",
  "fonts/manrope-latin-500-normal.woff2", "fonts/manrope-latin-600-normal.woff2",
  "fonts/manrope-latin-700-normal.woff2", "fonts/manrope-latin-800-normal.woff2",
  "fonts/barlow-condensed-latin-500-normal.woff2", "fonts/barlow-condensed-latin-600-normal.woff2",
  "fonts/barlow-condensed-latin-700-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("spz-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first so new picks and app updates show up right away; cache when offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
