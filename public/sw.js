// Offline support for the hosted app. It only ever serves the app's own files; athlete data never passes through here
// (that lives in the browser's storage on the device).
const CACHE = "racm-v1";

// Cache the app as it installs, so it opens offline even if this first visit is the only one with a connection.
// The script and stylesheet names change with every release, so they are read from the page itself.
self.addEventListener("install", (e) => e.waitUntil((async () => {
  const page = await fetch("./", { cache: "no-cache" });
  const files = [...new Set([...(await page.clone().text()).matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => "./" + m[1]))]; // a Set: the icon is linked twice and the cache refuses duplicates
  const cache = await caches.open(CACHE);
  await cache.put("./", page);
  await cache.addAll(files);
  self.skipWaiting();
})()));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // fonts and anything else: the browser handles it
  // Network first, so a new release shows up as soon as there is a connection; the cached copy is the offline fallback.
  // The page itself is always revalidated: otherwise the browser's own cache can keep serving an old release.
  const ask = e.request.mode === "navigate" ? fetch(url.href, { cache: "no-cache" }) : fetch(e.request);
  e.respondWith(
    ask
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./")))
  );
});
