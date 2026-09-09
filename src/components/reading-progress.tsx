"use client";

import { useEffect, useRef, useState } from "react";

/**
 * شريط تقدم القراءة — حصر الحساب في حاوية متن المقال (Container-Bound):
 *
 * نقطة البداية (0%) عندما يلمس أعلى المتن قمة نافذة العرض، ونقطة النهاية
 * (100%) عندما يبلغ أسفل آخر فقرة في المتن أسفل الشاشة — دون احتساب
 * التعليقات أو المقالات المقترحة أو الفوتر في المعادلة إطلاقًا.
 *
 * مرجع الحاوية ثابت برمجيًا (#article-body) مع مراقب أبعاد يعيد الحساب
 * فور تغير ارتفاع المحتوى (تحميل الغلاف/الخطوط) فلا قفزات زائفة.
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const calculateProgress = (): number => {
      const content = document.getElementById("article-body");
      if (!content) return 0;
      const rect = content.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalContentHeight = rect.height;

      /* المسافة المقطوعة داخل المقال — من لمس أعلى المتن قمة النافذة */
      const scrolled = windowHeight - rect.top;

      if (scrolled <= 0) return 0;
      if (scrolled >= totalContentHeight) return 100;
      return Math.min(100, Math.max(0, Math.round((scrolled / totalContentHeight) * 100)));
    };

    const update = () => {
      raf.current = null;
      setProgress(calculateProgress() / 100);
    };

    const onScroll = () => {
      if (raf.current === null) raf.current = window.requestAnimationFrame(update);
    };

    const content = document.getElementById("article-body");
    /* تغير ارتفاع المتن (صور/خطوط) يعيد المعايرة لحظيًا */
    const ro = new ResizeObserver(onScroll);
    if (content) ro.observe(content);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", onScroll);
    update();
    /* تسوية بعد اكتمال التخطيط الأول والخطوط */
    const t1 = window.setTimeout(update, 400);
    const t2 = window.setTimeout(update, 1500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("load", onScroll);
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      className="no-print fixed inset-x-0 top-0 z-50 h-1 origin-right"
      style={{
        background: "transparent",
        transform: `scaleX(${progress})`,
        transition: "transform 80ms linear",
      }}
      role="progressbar"
      aria-label="تقدم القراءة"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full w-full"
        style={{
          background: "linear-gradient(90deg, var(--accent), var(--accent-strong))",
          borderRadius: "0 999px 999px 0",
        }}
      />
    </div>
  );
}
