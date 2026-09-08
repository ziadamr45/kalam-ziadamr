"use client";

import { useEffect, useRef } from "react";

/**
 * ============================================================
 * رقيب القراءة المتأنية — خطاف «إتمام القراءة» لمحرك الأثر
 * ============================================================
 * لا تُحتسب النقاط بمجرد فتح الرابط؛ يشترط برمجيًا:
 *  1. بقاء القارئ في الصفحة مدة تتناسب طرديًا مع عدد كلمات المقال
 *     (تُحسب في الخادم من المتن الفعلي — هذه القيمة مرآة إرشادية).
 *  2. تمرير 80% على الأقل من صفحة المقال.
 * ويُحتسب مرة واحدة فقط لكل مقال (قيد فريد في قاعدة البيانات
 * + حاجز جلسة في المتصفح يمنع الطلبات المكررة).
 * المكوّن غير مرئي إطلاقًا ولا يمس التخطيط.
 */
export function ImpactReadTracker({
  articleId,
  requiredSeconds,
  isLoggedIn,
}: {
  articleId: string;
  requiredSeconds: number;
  isLoggedIn: boolean;
}) {
  const dwell = useRef(0);
  const maxScroll = useRef(0);
  const fired = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || fired.current) return;

    /* حاجز الجلسة: لا طلب مكرر في نفس التصفحة لنفس المقال */
    const guardKey = `impact-read:${articleId}`;
    try {
      if (sessionStorage.getItem(guardKey) === "1") return;
    } catch {}

    /* أقصى نسبة تمرير وصلها القارئ */
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        maxScroll.current = 100;
        return;
      }
      const pct = Math.round((window.scrollY / scrollable) * 100);
      if (pct > maxScroll.current) maxScroll.current = Math.min(100, pct);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    /* مدة البقاء الفعلية — تُحتسب والصفحة مرئية فقط */
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") dwell.current += 1;
    }, 1000);

    /* الفحص الدوري: هل استُوفيت الشروط؟ */
    const check = setInterval(() => {
      if (fired.current) return;
      if (dwell.current >= requiredSeconds && maxScroll.current >= 80) {
        fired.current = true;
        clearInterval(check);
        try {
          sessionStorage.setItem(guardKey, "1");
        } catch {}
        fetch("/api/impact/award", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "READ_COMPLETE",
            articleId,
            dwellSeconds: dwell.current,
            scrollPercent: maxScroll.current,
          }),
        }).catch(() => {});
      }
    }, 4000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      clearInterval(tick);
      clearInterval(check);
    };
  }, [articleId, requiredSeconds, isLoggedIn]);

  return null;
}
