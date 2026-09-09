/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* حظر التضمين في أي إطار خارجي — مضاد النقر الخفي (يُدعم بـ frame-ancestors 'none' في CSP) */
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  /* استثناء محرك PDF التحريري من تجميع webpack — يحتاج تحميل وحداته
     ESM الأصلية وقت التشغيل (نفس ضبط الريبو الإداري المثبت) */
  serverExternalPackages: ["@react-pdf/renderer"],
  /* ضم خطوط القالب التحريري (Tajawal + Amiri) وpdfkit إلى حزمة
     الـ serverless لمسار تصدير المقالات */
  outputFileTracingIncludes: {
    "/api/articles/[slug]/pdf": ["./src/assets/fonts/**", "./node_modules/pdfkit/**"],
  },
  /* تطهير حزم الإنتاج من رسائل التصحيح — console.* تُستأصل من bundles
     العميل تلقائيًا ما عدا console.error لرسائل الحارس */
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
