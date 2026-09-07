import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware المنصة العامة — ترويسات أمان عالمية
 * (التحقق من الهوية يحدث داخل مسارات API نفسها)
 */
export function middleware(request: NextRequest) {
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|sw.js).*)"],
};
