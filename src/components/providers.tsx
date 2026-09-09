"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { OnboardingExperience } from "@/components/onboarding-experience";
import { AuthGateOverlay } from "@/components/auth-gate";
import { NotificationToasts } from "@/components/notification-bell";

/* ============================ الثيم ============================ */

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
  /** هل قُرئ الثيم المحفوظ واكتمل الترطيب؟ يُمنع به رسم أيقونة الثيم قبل الجهوزية لمنع الوميض */
  ready: boolean;
}>({ theme: "light", toggleTheme: () => {}, ready: false });

export function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  /* الجهوزية: يُرفع في نفس التأثير الذي يقرأ التخزين المحلي — الاثنان يُجمَعان
     في تصيير واحد، فأول رسم للأيقونة بعد الجهوزية يكون صحيحًا من أول مرة */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored =
      (typeof window !== "undefined" && window.localStorage.getItem("kalam_theme")) as Theme | null;
    if (stored === "dark" || stored === "light") setTheme(stored);
    setReady(true);
  }, []);

  const applyTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem("kalam_theme", next);
        document.cookie = `kalam_theme=${next}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      return next;
    });
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

/* ===================== تسجيل Service Worker ===================== */

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        {/* تجربة التهيئة الموحدة — لا ترسم شيئًا إلا للأعضاء الجدد بعد حسم الجلسة */}
        <OnboardingExperience />
        {/* بوابة المصادقة الموحدة للتفاعل الفكري — نافذة دخول ذكية تحتفظ بنية التفاعل */}
        <AuthGateOverlay />
        {/* التوست اللحظي للإشعارات الواردة أثناء التصفح (SSE) */}
        <NotificationToasts />
        <ServiceWorkerRegistrar />
      </ThemeProvider>
    </SessionProvider>
  );
}
