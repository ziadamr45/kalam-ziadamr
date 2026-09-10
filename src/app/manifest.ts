import type { MetadataRoute } from "next";

/**
 * بيان التطبيق — واجهة تثبيت PWA متقدمة (Richer Install UI):
 * المتصفح يعرض نافذة استعراض شبيهة بالمتاجر الرسمية تتضمن الاسم
 * والوصف وشريط لقطات الشاشة (نسق الجوال الضيق + الحاسوب العريض)
 * قبل الضغط على «تثبيت». اللقطات حية من إنتاج المنصة في
 * public/screenshots/ وتُلتقط آليًا عبر scripts/capture-pwa-screenshots.py
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "كلام له لازمة | منصة فكرية واعية",
    short_name: "كلام له لازمة",
    description:
      "منصة فكرية نقية: بلا ضجيج، بلا إعلانات، بلا حشو. مقالات مقروءة ومسموعة، ومحاورة فكرية هادفة لصناعة أثر حقيقي.",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    orientation: "portrait",
    background_color: "#FDFBF7",
    theme_color: "#F8F4EC",
    categories: ["news", "education", "lifestyle"],
    /* اختصارات الضغط المطول على أيقونة التطبيق في الشاشة الرئيسية —
       قائمة سريعة تفتح أعمق مسارات المنصة مباشرة (App Shortcuts) */
    shortcuts: [
      {
        name: "أحدث المقالات",
        short_name: "المقالات",
        description: "تصفح أحدث المقالات الفكرية المنشورة",
        url: "/#latest-articles",
        icons: [{ src: "/icons/shortcut-articles.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "قراءاتي المحفوظة",
        short_name: "المحفوظات",
        description: "الوصول السريع إلى مكتبتك وقراءاتك المحفوظة",
        url: "/saved",
        icons: [{ src: "/icons/shortcut-saved.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "البحث الفكري",
        short_name: "بحث",
        description: "ابحث في المقالات والأفكار",
        url: "/search",
        icons: [{ src: "/icons/shortcut-search.png", sizes: "96x96", type: "image/png" }],
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/screenshots/mobile-home.png",
        sizes: "1080x2400",
        type: "image/png",
        form_factor: "narrow",
        label: "الواجهة الرئيسية واستعراض مسارات الفكر والمقالات",
      },
      {
        src: "/screenshots/mobile-article.png",
        sizes: "1080x2400",
        type: "image/png",
        form_factor: "narrow",
        label: "تجربة قراءة وتلاوة صوتية متزامنة ومرتبة",
      },
      {
        src: "/screenshots/mobile-dark.png",
        sizes: "1080x2400",
        type: "image/png",
        form_factor: "narrow",
        label: "القراءة الليلية الداكنة المريحة للعين",
      },
      {
        src: "/screenshots/desktop-preview.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "عرض المنصة وتجربة القراءة على أجهزة الكمبيوتر",
      },
    ],
  };
}
