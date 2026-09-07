import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "كلام له لازمة",
    template: "%s | كلام له لازمة",
  },
  description:
    "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
  keywords: ["مقالات", "فكر", "ثقافة", "كلام له لازمة", "مقالات عربية"],
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: SITE_URL,
    siteName: "كلام له لازمة",
    title: "كلام له لازمة",
    description: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "كلام له لازمة",
    description: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.",
    images: ["/og-default.png"],
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${amiri.variable} ${readex.variable} ${amiriQuran.variable} ${naskh.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="font-ui min-h-screen flex flex-col antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
