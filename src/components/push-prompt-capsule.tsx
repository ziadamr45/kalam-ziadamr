"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { pushSupported, subscribeToPush } from "@/lib/push-client";

/**
 * كبسولة تفعيل الإشعارات الذكية غير المزعجة — هادئة تظهر في وقتها فقط:
 *
 * شروط الظهور الصارمة:
 *  1) ممنوعة كليًا داخل صفحات قراءة المقالات الفردية (/article/*)
 *     — وتظهر فقط في الرئيسية وصفحة الحساب (مواضع تحميلها المدروسة).
 *  2) لا تظهر إن سبق تفعيل الإشعارات في هذا المتصفح أبدًا.
 *  3) لا تظهر إن رفض الزائر الإذن سابقًا (حالة denied من المتصفح نفسه).
 *  4) [لاحقًا] تهدئة 4 أيام كاملة قبل التذكير مجددًا.
 *  5) حد أقصى 3 مرات طوال عمر المتصفح — بعدها صمت أبدِ.
 */

const LATER_TS_KEY = "kalam_push_later_ts";
const PROMPT_COUNT_KEY = "kalam_push_prompt_count";
const DONE_KEY = "kalam_push_done";
const COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000; // 4 أيام
const MAX_PROMPTS = 3; // حد أقصى ثلاث مرات

export default function PushPromptCapsule() {
  const pathname = usePathname() ?? "/";
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* حظر مطلق داخل صفحات المقالات — شبكة أمان مضاعفة فوق مواضع التحميل */
    if (pathname.startsWith("/article")) return;

    let alive = true;
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (window.localStorage.getItem(DONE_KEY)) return;

        const count = parseInt(window.localStorage.getItem(PROMPT_COUNT_KEY) ?? "0", 10) || 0;
        if (count >= MAX_PROMPTS) return;

        const laterTs = parseInt(window.localStorage.getItem(LATER_TS_KEY) ?? "0", 10) || 0;
        if (laterTs && Date.now() - laterTs < COOLDOWN_MS) return;

        if (!pushSupported()) return;
        if (typeof Notification !== "undefined" && Notification.permission !== "default") return;

        /* إن كان الاشتراك قائمًا فعلًا فلا داعي لأي سؤال */
        try {
          const reg = await navigator.serviceWorker?.getRegistration?.();
          const sub = await reg?.pushManager?.getSubscription?.();
          if (sub) {
            window.localStorage.setItem(DONE_KEY, "1");
            return;
          }
        } catch {}

        if (alive) {
          setVisible(true);
          setReady(true);
        }
      } catch {
        /* كبسولة تزيين — أي عطل يصمت */
      }
    })();

    return () => {
      alive = false;
    };
  }, [pathname]);

  const dismiss = useCallback((remember: boolean) => {
    try {
      if (remember) {
        window.localStorage.setItem(LATER_TS_KEY, String(Date.now()));
        const count = (parseInt(window.localStorage.getItem(PROMPT_COUNT_KEY) ?? "0", 10) || 0) + 1;
        window.localStorage.setItem(PROMPT_COUNT_KEY, String(count));
      }
    } catch {}
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const res = await subscribeToPush();
      /* نجاح الاشتراك أو رفض صريح للإذن — كلاهما يصمتان للأبد احترامًا لقرار الزائر */
      if (res.ok || res.reason === "denied") {
        try {
          window.localStorage.setItem(DONE_KEY, "1");
        } catch {}
        setVisible(false);
      }
    } catch {} finally {
      setBusy(false);
    }
  }, []);

  if (!ready || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="تفعيل إشعارات المنصة"
      className="no-print fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 animate-fade-up"
    >
      <div
        className="flex w-full max-w-2xl flex-col items-start gap-3 rounded-2xl border p-4 shadow-lift sm:flex-row sm:items-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)" }}
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <p className="min-w-0 flex-1 text-sm leading-7" style={{ color: "var(--ink)" }}>
          فعّل إشعارات المنصة ليصلك كل مقال فكري جديد فور نشره، وتنبه بالردود على تعليقاتك.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={enable}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {busy ? "لحظة.." : "تفعيل الإشعارات الآن"}
          </button>
          <button
            onClick={() => dismiss(true)}
            className="rounded-full px-4 py-2 text-sm transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            لاحقًا
          </button>
        </div>
      </div>
    </div>
  );
}
