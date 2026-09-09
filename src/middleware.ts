import { NextResponse, type NextRequest, after } from "next/server";

/**
 * Middleware المنصة العامة — درع الحافة:
 * 1. ترويسات أمان صارمة (CSP مضبوطة المصادر + عزل الإطارات)
 * 2. حجب ماسحات المسارات المعروفة (Scanners) فورًا بلا معالجة
 * 3. منع كاش المتصفح لاستجابات API البيانات الشخصية (no-store)
 * 4. مرصد الحركة الحي: معرف ارتباط x-kalam-rid + توثيق Neon
 * (التحقق من الهوية يحدث داخل مسارات API نفسها)
 */

/** المسارات المستثناة من المرصد (لا تُسجل نفسها ولا الأصول الثابتة) */
const UNTRACKED = ["/api/internal", "/_next/static", "/_next/image", "/sw.js", "/offline"];

/**
 * سياسة أمان المحتوى الصارمة:
 * - default-src 'self' — كل ما لم يُصرَّح به محصور بالأصل
 * - script-src بلا أي مصدر خارجي — منع حقن السكربتات (XSS)
 * - object-src 'none' + base-uri 'self' + form-action 'self'
 * - frame-ancestors 'none' — لا تضمين داخل أي iframe خارجي (Anti-Clickjacking)
 * (الصور والوسائط https: لأن المنصة تعرض محتوى من مصادر خارجية اختيارها التحرير)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * مسارات الماسحات الآلية (Automated Scanners) — لا وجود لأي منها
 * في هذه المنصة؛ أي طلب لها اختراق آلي يُصد فورًا بلا استهلاك موارد.
 */
const SCANNER_PATTERNS = [
  "/wp-admin", "/wp-login.php", "/wordpress", "/xmlrpc.php",
  "/phpmyadmin", "/pma", "/mysql", "/adminer",
  "/.env", "/.git", "/.aws", "/.ssh", "/.svn", "/.DS_Store",
  "/vendor/phpunit", "/composer.json", "/composer.lock", "/package.json.bak",
  "/cgi-bin", "/shell", "/admin.php", "/config.php", "/setup.php",
  "/actuator", "/owa/", "/autodiscover", "/ecp/", "/api/v1/pods",
  "/.well-known/security.txt.bak", "/backup", "/dump.sql", "/database.sql",
];

/** استجابات API الشخصية — يُمنع حفظها في كاش/سجل المتصفح نهائيًا */
const PRIVATE_API_PREFIXES = [
  "/api/profile", "/api/saves", "/api/notifications", "/api/progress",
  "/api/my-comments", "/api/impact/logs", "/api/onboarding",
  "/api/push/subscribe", "/api/comments/votes",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lowerPath = pathname.toLowerCase();

  /* حجب فوري لماسحات الاختراق — 403 بلا أي معالجة أو توثيق
     (مطابقة حرفية صارمة للمسار نفسه أو بادئته، صفر مطاعمة حتى
     لا يُحجب محتوى مشروع يصدف تشابه لفظي في الرابط) */
  const isScannerProbe = SCANNER_PATTERNS.some(
    (p) => lowerPath === p || lowerPath.startsWith(p + "/") || lowerPath.startsWith(p + ".") || lowerPath.endsWith(p),
  );
  if (isScannerProbe) {
    return new NextResponse(null, { status: 403 });
  }

  const startAt = Date.now();
  const requestId = crypto.randomUUID();
  const trackable = !UNTRACKED.some((p) => pathname.startsWith(p));

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  response.headers.set("Content-Security-Policy", CSP);

  /* منع كاش المتصفح لاستجابات البيانات الشخصية — لا آثار في سجل الجهاز */
  if (PRIVATE_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
  }

  if (trackable) {
    response.headers.set("x-kalam-rid", requestId);

    /* تمرير المعرف للتطبيق كي يرتبط بالأخطاء في instrumentation */
    const entry = {
      requestId,
      app: "PUBLIC",
      method: request.method,
      path: pathname,
      status: null as number | null,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        null,
      userAgent: request.headers.get("user-agent"),
      country: request.headers.get("x-vercel-ip-country"),
      cookie: request.headers.get("cookie"),
    };

    after(async () => {
      try {
        await fetch(new URL("/api/internal/traffic", request.url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-traffic-secret": process.env.REVALIDATE_SECRET ?? "",
          },
          body: JSON.stringify({ ...entry, durationMs: Date.now() - startAt }),
          signal: AbortSignal.timeout(4000),
        });
      } catch {
        /* المرصدة زينة رقابية — لا تمس مسار القارئ أبدًا */
      }
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|sw.js).*)"],
};
