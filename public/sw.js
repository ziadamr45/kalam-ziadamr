/* ============================================================
   Service Worker — «كلام له لازمة»
   استراتيجية مزدوجة: الصفحات أولاً من الشبكة مع كاش احتياطي،
   الأصول الثابتة كاش أولًا. القراءة دون اتصال عبر IndexedDB.
   ============================================================ */

const CACHE_VERSION = "kalam-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/* الأصول الحرجة المُسبقة التخزين */
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* تخطي مسارات API — يجب أن تبقى حية دائمًا */
  if (url.pathname.startsWith("/api/")) return;

  /* التنقل بين الصفحات: الشبكة أولًا → الكاش → صفحة دون اتصال */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.match("/offline").then(
                (offlinePage) => offlinePage || new Response("دون اتصال", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
              ),
          ),
        ),
    );
    return;
  }

  /* الخطوط والأيقونات: كاش أولًا (نادرًا ما تتغير) */
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/static/"))
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  /* الخطوط من Google Fonts */
  if (
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  /* باقي الأصول: كاش أولًا مع تحديث خلفي */
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
