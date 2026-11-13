import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * بيان التطبيق الديناميكي — واجهة تثبيت PWA متقدمة (Richer Install UI):
 * المتصفح يعرض نافذة استعراض شبيهة بالمتاجر الرسمية تتضمن الاسم والوصف
 * وشريط لقطات الشاشة قبل الضغط على «تثبيت». اللقطات حية من إنتاج المنصة
 * في public/screenshots/ وتُلتقط آليًا عبر scripts/capture-pwa-screenshots.py
 *
 * ديناميكية في ثلاثة أبعاد:
 *  - الأيقونات تتبع كوكي kalam_theme: الوضع الساطع (الافتراضي) يثبّت
 *    الشعار الفاتح على الورق الكريمي، والداكن يثبّت الشعار الكحلي.
 *  - اختصار «متابعة القراءة» يظهر للمسجل دخوله فقط بأحدث موضع قراءته —
 *    يشير إلى /continue الثابت (أندرويد يحدّث البيان كل بضعة أيام، فالمسار
 *    الثابت يضمن فتح أحدث موضع لحظة الضغط مهما قدم كاش الجهاز).
 *  - أي عطل في القراءة الديناميكية لا يكسر البيان أبدًا — قيم افتراضية رصينة.
 */

type Shortcut = NonNullable<MetadataRoute.Manifest["shortcuts"]>[number];

/* امتداد البيان بمِيز launch_handler — التركيز على نافذة التطبيق القائمة
   بدل فتح نسخ جديدة تتزاحم مع الجلسة (Next لم يُضف الحقل لتعريفاته بعد).
   navigate-existing لا focus-existing: الأولى تركّز النافذة القائمة وتوجّهها
   للرابط كي تبقى الاختصارات والروابط العميقة (/continue والمشاركات) تعمل،
   والثانية تبتلع التنقل كليًا فتكسرها */
type ManifestWithLaunchHandler = MetadataRoute.Manifest & {
  launch_handler?: { client_mode?: string | string[] };
};

const STATIC_SHORTCUTS: Shortcut[] = [
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
];

const SCREENSHOTS: MetadataRoute.Manifest["screenshots"] = [
  {
    src: "/screenshots/mobile-home.png?v=2",
    sizes: "1080x2400",
    type: "image/png",
    form_factor: "narrow",
    label: "الواجهة الرئيسية — شعار المنصة وأحدث المقالات والأقسام",
  },
  {
    src: "/screenshots/mobile-article.png?v=2",
    sizes: "1080x2400",
    type: "image/png",
    form_factor: "narrow",
    label: "صفحة المقال — تشكيل حرفي متقن ومشغل تلاوة صوتي متزامن",
  },
  {
    src: "/screenshots/mobile-dark.png?v=2",
    sizes: "1080x2400",
    type: "image/png",
    form_factor: "narrow",
    label: "الوضع الداكن المريح للعين — قراءة ليلية فاخرة",
  },
  {
    src: "/screenshots/mobile-discuss.png?v=2",
    sizes: "1080x2400",
    type: "image/png",
    form_factor: "narrow",
    label: "المناقشة الذكية والتعليقات — حوار فكري هادف مع المقال",
  },
  {
    src: "/screenshots/mobile-search.png?v=2",
    sizes: "1080x2400",
    type: "image/png",
    form_factor: "narrow",
    label: "البحث الفكري — استكشف المقالات بكلمة واحدة",
  },
  {
    src: "/screenshots/desktop-home.png?v=2",
    sizes: "1920x1080",
    type: "image/png",
    form_factor: "wide",
    label: "المنصة على الشاشات الكبيرة — واجهة رئيسية فخمة",
  },
  {
    src: "/screenshots/desktop-article.png?v=2",
    sizes: "1920x1080",
    type: "image/png",
    form_factor: "wide",
    label: "تجربة القراءة على الحاسوب — مقال واسع ومريح",
  },
];

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  /* الأيقونة تتبع ثيم القارئ وقت التثبيت — الساطع افتراضيًا */
  let light = true;
  try {
    light = (await cookies()).get("kalam_theme")?.value !== "dark";
  } catch {}

  const icons: MetadataRoute.Manifest["icons"] = light
    ? [
        { src: "/icons/icon-light-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-light-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-light-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];

  /* اختصار المتابعة الديناميكي — للمسجل دخوله فقط (أندرويد يعرض 4 اختصارات كحد أقصى) */
  const shortcuts: Shortcut[] = [...STATIC_SHORTCUTS];
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      const rows = await prisma.readingProgress.findMany({
        where: { userId, article: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { article: { select: { title: true } } },
      });
      if (rows[0]) {
        const title = rows[0].article.title.trim().slice(0, 32);
        shortcuts.unshift({
          name: title.length >= 32 ? `متابعة القراءة: ${title}…` : `متابعة القراءة: ${title}`,
          short_name: "متابعة",
          description: "افتح آخر موضع قراءة لك فورًا — أينما توقفت",
          url: "/continue",
          icons: [{ src: "/icons/shortcut-continue.png", sizes: "96x96", type: "image/png" }],
        });
      }
    }
  } catch {}

  const manifest: ManifestWithLaunchHandler = {
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
    /* التركيز على نافذة التطبيق القائمة وتوجيهها بدل نسخة جديدة —
       يمنع تزاوج نافذتين وقت رجوع Google من تسجيل الدخول (سباق PWA) */
    launch_handler: { client_mode: "navigate-existing" },
    shortcuts,
    icons,
    screenshots: SCREENSHOTS,
  };
  return manifest;
}
