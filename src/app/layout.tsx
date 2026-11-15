import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import {
  Amiri,
  Readex_Pro,
  Amiri_Quran,
  Noto_Naskh_Arabic,
} from "next/font/google";
import "./globals.css";
import "./print.css";
import { Providers } from "@/components/providers";

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-next-body",
  display: "block",
});

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-next-ui",
  display: "block",
});

/* خط الرسم العثماني الفاخر للآيات القرآنية */
const amiriQuran = Amiri_Quran({
  weight: "400",
  subsets: ["arabic"],
  variable: "--font-quran",
  display: "swap",
  preload: false,
});

/* خط النسخ الكلاسيكي الرصين للأحاديث النبوية */
const naskh = Noto_Naskh_Arabic({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-naskh",
  display: "swap",
  preload: false,
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
      desc: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقتك.",
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
      /* ?v=6 يكسر كاش تطبيقات المحادثات (واتساب/تليجرام) عند تحديث الصورة */
      images: [{ url: "/og-default.png?v=6", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: ["/og-default.png?v=6"],
    },
    icons: {
      /* أيقونة التبويب المخصصة: شعار الكاف الأصلي المحدد —
         وأيقونات PWA الكاملة تبقى في manifest.ts للتثبيت على الموبايل */
      icon: [
        { url: "/favicon.ico?v=6", type: "image/x-icon" },
        { url: "/icons/favicon-tab.png?v=6", sizes: "96x96", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png?v=6",
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

/** سكربت ما قبل أول رسم لتفضيلات القراءة */
const readerPrefsNoFlashScript = `(function(){try{if(localStorage.getItem('kalam_tashkeel')==='on')document.documentElement.setAttribute('data-tashkeel-pref','on');if(localStorage.getItem('kalam_immersion')==='on'&&location.pathname.indexOf('/article/')===0)document.documentElement.setAttribute('data-immersion','on');}catch(e){}})();`;

/** حارس chunks بعد النشر */
const chunkLoadGuardScript = `(function(){function r(){var n=Date.now();try{var l=+sessionStorage.getItem('kalam_chunk_reload')||0;if(n-l<300000)return;sessionStorage.setItem('kalam_chunk_reload',String(n));}catch(e){}location.reload();}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t!==window&&t.tagName==='SCRIPT'&&typeof t.src==='string'&&t.src.indexOf('/_next/')!==-1){r();return;}var m=(e&&e.message)||'';if(/ChunkLoadError|dynamically imported module|Loading chunk|reading 'call'/.test(m))r();},true);window.addEventListener('unhandledrejection',function(e){var m='';try{m=String((e.reason&&e.reason.message)||e.reason||'');}catch(x){}if(/ChunkLoadError|dynamically imported module|Loading chunk|reading 'call'/.test(m))r();});})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png?v=6` },
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
        <meta name="apple-mobile-web-app-title" content="كلام له لازمة" />
        <meta name="application-name" content="كلام له لازمة" />
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        <script dangerouslySetInnerHTML={{ __html: readerPrefsNoFlashScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkLoadGuardScript }} />
      </head>
      <body className="font-ui min-h-screen flex flex-col antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
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
