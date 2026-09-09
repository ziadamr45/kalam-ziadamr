"use client";

import { useEffect, useRef, useState } from "react";

/** شريط تقدم القراءة — يتدرج بنعومة أعلى الصفحة مع حركة القارئ */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      raf.current = null;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      const current = total > 0 ? window.scrollY / total : 0;
      setProgress(Math.min(1, Math.max(0, current)));
    };
    const onScroll = () => {
      if (raf.current === null) raf.current = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
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
