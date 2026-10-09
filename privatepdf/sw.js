// PrivatePDF service worker: keeps the tools working offline.
// Libraries are cached on install; pages and app code are fetched fresh when
// online and served from the cache when not.
const CACHE = "privatepdf-v3";
const BASE = new URL("./", self.location).pathname; // "/pdf/"
const PRECACHE = [
  "", "merge-pdf/", "split-pdf/", "compress-pdf/", "rotate-pdf/", "jpg-to-pdf/", "pdf-to-jpg/", "delete-pdf-pages/", "add-page-numbers/", "png-to-pdf/",
  "assets/app.js", "assets/core.js", "assets/config.js", "assets/pdfops.js", "assets/styles.css", "assets/icon.svg",
  "assets/vendor/pdf-lib.esm.min.js", "assets/vendor/pdf.min.mjs", "assets/vendor/pdf.worker.min.mjs",
].map((p) => BASE + p);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("privatepdf-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Vendored libraries never change at the same URL: cache first.
  if (url.pathname.startsWith(BASE + "assets/vendor/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  // Everything else: network first, cache as fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
