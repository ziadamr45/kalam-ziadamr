"use client";

import { SessionProvider, signOut } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

/* ===================== حارس إبطال الجلسة عن بُعد ===================== */

/**
 * بروتوكول إنهاء الجلسة المحروق (كسر حلقة التحديث اللانهائية):
 *
 * عند إبطال جهاز من صفحة الملف كانت الكوكيز القديمة تبقى حية
 * (نداء signout الخام بلا CSRF يفشل صامتًا) → كل تحديث يعيد اكتشاف
 * الإبطال → حلقة لا نهائية. البروتوكول الجديد بالترتيب الصارم:
 *  ١. /api/auth/revoke-cleanup → الخادم يمسح كوكيز الجلسة httpOnly
 *     في نفس الاستجابة (JavaScript لا يستطيع حذفها)
 *  ٢. signOut({ redirect: false }) → تنظيف حالة Auth.js كاملة من
 *     جهة العميل (بـ CSRF سليم داخليًا)
 *  ٣. تنظيف أثر الحساب المحلي + ختم إشارة «انتهت الجلسة»
 *  ٤. تحويل نظيف للرئيسية حيث يستقبل المستخدم تنبيهًا لطيفًا
 *
 * يغطي أيضًا معالجة الجانب العميل (Session Cleanup): جلسة فارغة
 * مع مؤشر تسجيل دخول سابق محفوظ → نفس التنظيف الكامل.
 */

const WAS_LOGGED_IN_KEY = "kalam_was_logged_in";
const SESSION_ENDED_KEY = "kalam_session_ended";

/** إشارة إنهاء الجلسة — تُقرأ مرة واحدة ثم تُمسح */
export function consumeSessionEndedFlag(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_ENDED_KEY) === "1") {
      sessionStorage.removeItem(SESSION_ENDED_KEY);
      return true;
    }
  } catch {}
  return false;
}

function SessionRevocationWatcher() {
  const terminating = useRef(false);

  useEffect(() => {
    let cancelled = false;

    /** البروتوكول الكامل — يُنفَّذ مرة واحدة للحياة في الصفحة */
    const terminateSession = async (): Promise<void> => {
      if (terminating.current) return;
      terminating.current = true;
      try {
        /* ١: المسح الصارم الخادمي — موت الكوكي httpOnly فورًا */
        await fetch("/api/auth/revoke-cleanup", { cache: "no-store" }).catch(() => {});
        /* ٢: تنظيف حالة Auth.js من جهة العميل — بلا تحويل تلقائي */
        await signOut({ redirect: false }).catch(() => {});
      } catch {}
      try {
        /* ٣: لا آثار محلية للحساب + ختم التنبيه اللطيف */
        window.localStorage.removeItem(WAS_LOGGED_IN_KEY);
        window.sessionStorage.setItem(SESSION_ENDED_KEY, "1");
      } catch {}
      /* ٤: الرئيسية بنظافة كاملة — الكوكي مات فلا حلقة تعود */
      if (!cancelled) window.location.replace("/");
    };

    const check = async (): Promise<void> => {
      if (terminating.current) return;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return; // خطأ شبكة/خادم مؤقت — لا يُعتبر إبطالًا
        const data = (await res.json()) as {
          deviceRevoked?: boolean;
          user?: { email?: string | null } | null;
          expires?: string;
        } | null;
        if (cancelled) return;

        /* الحالة الأولى: خادم الحسابة أعلن الإبطال صراحة */
        if (data?.deviceRevoked) {
          void terminateSession();
          return;
        }

        const hasUser = Boolean(data?.user && (data.user.email || data.expires));
        try {
          if (hasUser) {
            /* جلسة حية — يُختم مؤشر الدخول للاستيقاظ عليه لاحقًا */
            window.localStorage.setItem(WAS_LOGGED_IN_KEY, "1");
          } else if (window.localStorage.getItem(WAS_LOGGED_IN_KEY) === "1") {
            /* الحالة الثانية: جلسة فارغة/401 مع مؤشر دخول سابق
               → تنظيف كامل يمنع إرسال طلبات متكررة بلا هوية */
            void terminateSession();
          }
        } catch {}
      } catch {
        /* شبكة متقطعة — تُعاد المحاولة في الدورة التالية */
      }
    };

    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return null;
}

/* ================== تنبيه «تم إنهاء جلستك» اللطيف ================== */

/**
 * يستقبل إشارة kalam_session_ended بعد التحويل إلى الرئيسية
 * ويعرض تنبيهًا هادئًا يوضح سبب خروج المستخدم المفاجئ —
 * بلا ألوان إنذار، بل رسالة اطمئنان راقية بلغة المنصة.
 */
function SessionEndedToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (consumeSessionEndedFlag()) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 8000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!show) return null;
  return (
    <div
      role="status"
      className="animate-fade-up fixed inset-x-4 bottom-6 z-[90] mx-auto max-w-md rounded-2xl border px-5 py-4 shadow-lift"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-strong)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <p className="font-ui text-sm font-bold" style={{ color: "var(--ink)", textAlign: "right" }}>
            تم إنهاء جلستك على هذا الجهاز من لوحة التحكم
          </p>
          <p className="font-body mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)", textAlign: "right" }}>
            يمكنك تسجيل الدخول مرة أخرى في أي وقت — قراءاتك محفوظة بأمان.
          </p>
        </div>
        <button
          onClick={() => setShow(false)}
          aria-label="إغلاق التنبيه"
          className="ms-auto shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
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
        {/* حارس إبطال الجلسة عن بُعد — مسح صارم للكوكيز يكسر حلقة التحديث */}
        <SessionRevocationWatcher />
        {/* تنبيه «تم إنهاء جلستك من لوحة التحكم» بعد التحويل النظيف */}
        <SessionEndedToast />
        <ServiceWorkerRegistrar />
      </ThemeProvider>
    </SessionProvider>
  );
}
