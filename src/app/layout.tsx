import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import {
  Amiri,
  Readex_Pro,
  Amiri_Quran,
  Noto_Naskh_Arabic,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

/* خط الرسم العثماني الفاخر للآيات القرآنية */
const amiriQuran = Amiri_Quran({
  weight: "400",
  subsets: ["arabic"],
  variable: "--font-quran",
  display: "swap",
});

/* خط النسخ الكلاسيكي الرصين للأحاديث النبوية */
const naskh = Noto_Naskh_Arabic({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-naskh",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kalam-ziadamr.vercel.app";

/* الوصف والعنوان الوصفي يُدارَان من لوحة التحكم (إعدادات الموقع) */
async function getMeta() {
  try {
    const { getSiteConfig } = await import("@/lib/site-config");
    const cfg = await getSiteConfig();
    return {
      name: cfg.SITE_NAME || "كلام له لازمة",
      title: cfg.SITE_META_TITLE || "كلام له لازمة",
      desc: cfg.SITE_META_DESC,
    };
  } catch {
    return {
      name: "كلام له لازمة",
      title: "كلام له لازمة",
      desc: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, desc } = await getMeta();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${title.includes("كلام له لازمة") ? "كلام له لازمة" : title}`,
    },
    description: desc,
    keywords: ["مقالات", "فكر", "ثقافة", "كلام له لازمة", "مقالات عربية"],
    openGraph: {
      type: "website",
      locale: "ar_EG",
      url: SITE_URL,
      siteName: "كلام له لازمة",
      title,
      description: desc,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: ["/og-default.png"],
    },
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/apple-touch-icon.png",
    },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDFBF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** سكربت منع الوميض — يطبّق الثيم المحفوظ قبل الترطيب */
const themeNoFlashScript = `(function(){try{var t=localStorage.getItem('kalam_theme');if(!t){var m=document.cookie.match(/(?:^|; )kalam_theme=(light|dark)/);t=m?m[1]:'light';}if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark');}}catch(e){}})();`;

/** سكربت ما قبل أول رسم لتفضيلات القراءة — يُنفَّذ في <head> على كل صفحة:
    التشكيل: يزرع data-tashkeel-pref فتُخفي بوابة CSS المتن المجرد قبل أي بكسل.
    كانت السمة تُزرع من سكربت داخل شجرة صفحة المقال فلا يُنفَّذ إطلاقًا في
    التنقية الناعمة (الرئيسية ← مقال) فيُرى المتن مجردًا ثم يتبدل — وهذا هو
    جذر الفلاش؛ السمة هنا تعيش على <html> عبر التنقيات الناعمة كلها.
    الغمر: على صفحات المقالات حصرًا يزرع data-immersion ليُطوى واجهة المقال
    قبل استعادته بعد إعادة التحميل فيرسم المتصفح تخطيط الغمر النهائي من أول
    لحظة ويستعيد موضع التمرير المحفوظ عليه حرفيًا — لا وميض ولا قفزة */
const readerPrefsNoFlashScript = `(function(){try{if(localStorage.getItem('kalam_tashkeel')==='on')document.documentElement.setAttribute('data-tashkeel-pref','on');if(localStorage.getItem('kalam_immersion')==='on'&&location.pathname.indexOf('/article/')===0)document.documentElement.setAttribute('data-immersion','on');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* بيانات الموقع المنظمة (WebSite schema) — هي التي يقرأها جوجل لعرض
     اسم الموقع في نتائج البحث بدلًا من اسم المنصة المستضيفة: بغيرها
     يعتمد جوجل على النطاق المسجل فيعرض «Vercel» بدل اسم المنصة.
     الاسم والوصف من التكوين السيادي للموقع نفسه — لا شيء مُخترَع */
  const { name, desc } = await getMeta();
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: SITE_URL,
    inLanguage: "ar",
    description: desc,
    publisher: {
      "@type": "Organization",
      name,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png` },
    },
  };

  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${amiri.variable} ${readex.variable} ${amiriQuran.variable} ${naskh.variable}`}
    >
      <head>
        {/* اسم التطبيق الكامل على الشاشة الرئيسية — iOS يستخدمه عند
            «إضافة إلى الشاشة الرئيسية» بدل <title>، وAndroid يعتمده
            كاحتياطي إن غاب بيان الويب، لضمان تطابق الاسم على المنصتين */}
        <meta name="apple-mobile-web-app-title" content="كلام له لازمة" />
        <meta name="application-name" content="كلام له لازمة" />
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        <script dangerouslySetInnerHTML={{ __html: readerPrefsNoFlashScript }} />
      </head>
      <body className="font-ui min-h-screen flex flex-col antialiased">
        {/* بيانات الموقع المنظمة — على كل صفحة ليعيش الاسم مع أي صفحة يزحف إليها جوجل */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {/* شريط التقدم العلوي الفوري — شريط ذهبي نحيف يظهر لحظة لمس أي رابط
            ليمنح القارئ إشعارًا بصريًا فوريًا بأن الطلب قيد الاستجابة */}
        <NextTopLoader
          color="var(--accent)"
          initialPosition={0.08}
          crawlSpeed={200}
          speed={300}
          height={3}
          showSpinner={false}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
