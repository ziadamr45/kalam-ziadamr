/* ============================================================
   Service Worker — «كلام له لازمة»
   استراتيجية مزدوجة: الصفحات أولاً من الشبكة مع كاش احتياطي،
   الأصول الثابتة كاش أولًا. القراءة دون اتصال عبر IndexedDB.
   ============================================================ */

/* رفع الإصدار: إبعاد أصول Next.js وحمولات RSC عن أي كاش للسواتش —
   الكاش القديم كان يخدم chunks وحمولات RSC من نسخة نشر سابقة بعد
   كل تحديث، فينهار التنقيل بـ «Cannot read properties of undefined
   (reading 'call')» عند طلب chunk محذوف من نسخة قديمة مفتوحة.
   رفع النسخة يصفّي الكاش المسموم لدى كل المثبتين */
const CACHE_VERSION = "kalam-v10";
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
  "/badge-public-96x96.png",
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

  /* أصول Next.js (chunks ثابتة) وحمولات التنقيل RSC (?_rsc=): تُترك
     للمتصفح تمامًا بلا أي تدخل من السواتش — المتصفح يكتمها بنفسه
     (Vercel يعلمها immutable) ونسخة HTML الجديدة بعد كل نشر تشير
     إلى chunks جديدة بأسماء جديدة فلا تُطلب القديمة أصلًا؛ التدخل
     بالكاش هنا كان سبب انهيار التنقيل بعد كل نشر */
  if (url.pathname.startsWith("/_next/") || url.searchParams.has("_rsc")) return;

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

  /* بيان التطبيق (Manifest): الشبكة أولًا دائمًا — حتى يرى متصفح
     أندرويد أحدث اسم وأيقونات عند تحديث WebAPK المثبّت على
     الشاشة الرئيسية؛ تقديم نسخة قديمة من الكاش يعني بقاء اسم
     التطبيق القديم تحت الأيقونة رغم تصحيح الملف */
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
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

/* ============================================================
   إشعارات الويب الفورية — Web Push بمعيار VAPID
   الشعار الملون أيقونةً داخل متن الإشعار، والبادج المفرّغ ألفا-فقط
   (أبيض صافٍ على شفاف) لشريط حالة أندرويد — النظام يحوّل أي بكسل
   غير شفاف في حقل badge إلى مربع أبيض مصمت، لذا يُمنع نهائيًا
   وضع صور ملونة فيه. وسم افتراضي ثابت + renotify يسمح بالتحديث الصوتي.
   ============================================================ */

const PUSH_ICON = "/icons/icon-192.png";
const PUSH_BADGE = "/badge-public-96x96.png";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "كلام له لازمة", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "كلام له لازمة";
  const options = {
    body: data.body || "",
    icon: data.icon || PUSH_ICON,
    badge: data.badge || PUSH_BADGE,
    tag: data.tag || "kalam-public-notification",
    renotify: true,
    dir: "rtl",
    lang: "ar",
    vibrate: [80, 40, 80],
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        /* نافذة مفتوحة على الهدف نفسه → تركيز فوري */
        for (const client of clientList) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        /* نافذة مفتوحة على المنصة → تركيزها ثم التوجيه للهدف */
        for (const client of clientList) {
          if (
            new URL(client.url).origin === self.location.origin &&
            "focus" in client
          ) {
            client.focus();
            if ("navigate" in client) {
              return Promise.resolve(client.navigate(target)).catch(() =>
                self.clients.openWindow(target),
              );
            }
            return client.postMessage({ type: "NAVIGATE", url: target });
          }
        }
        /* لا نافذة مفتوحة → فتح الهدف مباشرة */
        return self.clients.openWindow(target);
      }),
  );
});
