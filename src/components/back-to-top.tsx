"use client";

import { useEffect, useRef, useState } from "react";

/**
 * زر العودة للأعلى الذكي — سلوك هادئ لا يعطل القراءة إطلاقًا:
 *
 * 1) الظهور المشروط: لا يظهر إلا بعد تجاوز 400px من التمرير (تعمّق حقيقي في المقال).
 * 2) الإخفاء التلقائي عند الخمول: يظهر لحظة حركة التمرير (أعلى أو أسفل) ثم
 *    يتلاشى تلقائيًا بعد 2.5 ثانية من التوقف — فلا يحجب نصوص الفوتر
 *    وروابط المقال وأخلاقيات التعليق أسفل الصفحة ولا شيء بعدها.
 * 3) الموضع الآمن: أسفل يسار الشاشة فوق شريط أدوات القراءة المثبت بمسافة مريحة،
 *    ويرتفع تلقائيًا فوق الكبسولة الصوتية العائمة لحظة نشاطها حتى لا يتداخلا أبدًا
 *    (تنسيق عبر حدث window «kalam:audio-capsule» الذي تصدره الكبسولة).
 * 4) محاذاة الإطار: على الشاشات الكبيرة يلتصق بعمود إطار المحتوى (max-w-5xl)
 *    بدل التطاير عند الحافة القصوى، مع هدف لمس ≥ 48×48px وتفاعل hover ناعم.
 */

const SHOW_THRESHOLD = 400; // px — عتبة التعمق في المقال
const IDLE_HIDE_MS = 2500; // إخفاء تلقائي بعد توقف التمرير

export function BackToTop() {
  const [deep, setDeep] = useState(false); // تجاوز عتبة التمرير
  const [active, setActive] = useState(false); // حركة تمرير حديثة (لم تخمُد بعد)
  const [capsuleActive, setCapsuleActive] = useState(false); // الكبسولة الصوتية ظاهرة
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearIdle = () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
    };

    const onScroll = () => {
      const beyond = window.scrollY >= SHOW_THRESHOLD;
      setDeep(beyond);
      clearIdle();
      if (beyond) {
        /* حركة تمرير حية — يظهر فورًا ويعيد تسليح مؤقت الخمول */
        setActive(true);
        idleTimer.current = setTimeout(() => setActive(false), IDLE_HIDE_MS);
      } else {
        setActive(false);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdle();
    };
  }, []);

  /* الاستماع لحالة الكبسولة الصوتية العائمة — للارتفاع فوقها دون تداخل */
  useEffect(() => {
    const onCapsule = (e: Event) => {
      setCapsuleActive(Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active));
    };
    window.addEventListener("kalam:audio-capsule", onCapsule);
    return () => window.removeEventListener("kalam:audio-capsule", onCapsule);
  }, []);

  const visible = deep && active;

  /* الراحة الرأسية: فوق شريط الأدوات السفلي، وفوق الكبسولة الصوتية إن كانت نشطة */
  const bottomClass = capsuleActive
    ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
    : "bottom-[calc(6rem+env(safe-area-inset-bottom))]";

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="العودة إلى أعلى الصفحة"
      title="العودة إلى أعلى الصفحة"
      className={`no-print fixed z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lift transition-all duration-300 ease-out
        ${bottomClass}
        left-6 lg:left-[max(1.5rem,calc(50%-30.5rem))]
        hover:scale-110 active:scale-95
        ${
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      style={{
        background: "var(--surface)",
        color: "var(--accent)",
        border: "1px solid var(--border)",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
