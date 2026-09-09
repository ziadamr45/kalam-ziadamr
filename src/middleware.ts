import { NextResponse, type NextRequest, after } from "next/server";

/**
 * Middleware المنصة العامة — ترويسات أمان عالمية
 * (التحقق من الهوية يحدث داخل مسارات API نفسها)
 * + مرصد الحركة الحي: معرف ارتباط x-kalam-rid لكل طلب، وتوثيق
 *   الحركة في Neon بعد انتهاء الاستجابة عبر after() — app=PUBLIC
 */

/** المسارات المستثناة من المرصد (لا تُسجل نفسها ولا الأصول الثابتة) */
const UNTRACKED = ["/api/internal", "/_next/static", "/_next/image", "/sw.js", "/offline"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self' https:",
      "img-src 'self' https: data: blob:",
      "media-src 'self' https: blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "font-src 'self' https: data:",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
    ].join("; "),
  );

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
