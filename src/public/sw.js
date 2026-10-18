const version = new URL(self.location.href).searchParams.get("version") ?? "1";
const CACHE_NAME = `budgie-runtime-v${version}`;
const PRECACHE_URLS = ["./"];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match(request)) ??
          (await cache.match(new URL("./", self.location.href).href));
        const refresh = fetch(request).then((response) => {
          const copy = response.clone();
          void cache.put(request, copy);
          return response;
        });
        return cached ?? refresh.catch(() => caches.match("./"));
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(new URL(request.url).href);
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void cache.put(request, copy);
        }
        return response;
      });
    }),
  );
});
