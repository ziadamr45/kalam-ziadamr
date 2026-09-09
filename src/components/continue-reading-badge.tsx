"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * استئناف القراءة الذكي — شارة عائمة غير معطِّلة للقراءة:
 * «توقفت عند X% — متابعة القراءة».
 *
 * الحفظ مزدوج: نسخة localStorage فورية للاستجابة، ونسخة في قاعدة البيانات
 * (POST /api/progress) للمسجلين لتتزامن عبر كل أجهزتهم.
 * الشارة لا تظهر إلا عند العودة لمقال لم يكتمل (5%–95%)، وتختفي
 * لحظة الاستئناف أو بلوغ النهاية، ولا تعترض أبدًا شريط الأدوات أو الكبسولة الصوتية.
 */

const lsKey = (slug: string) => `kalam_progress:${slug}`;

type SavedProgress = { pct: number; scrollY: number; at: number };

export default function ContinueReadingBadge({ slug, articleId }: { slug: string; articleId: string }) {
  const { status } = useSession();
  const [resume, setResume] = useState<SavedProgress | null>(null);
  const [progress, setProgress] = useState(0);

  const latest = useRef({ pct: 0, scrollY: 0 });
  const lastSaved = useRef(0);
  const resumed = useRef(false);

  /* ============ الاستعادة عند العودة ============ */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lsKey(slug));
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedProgress;
      if (saved.pct >= 5 && saved.pct <= 95 && Date.now() - (saved.at ?? 0) < 90 * 24 * 3600 * 1000) {
        setResume(saved);
      }
    } catch {}

    /* مزامنة عبر الأجهزة: إن كان المستخدم مسجلًا فقاعدة البيانات أصدق إن كانت أحدث */
    if (status !== "authenticated") return;
    fetch(`/api/progress?articleId=${encodeURIComponent(articleId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.ok || !d.progress || d.progress < 5 || d.progress > 95) return;
        setResume((prev) => {
          if (prev && prev.at >= (d.savedAt ?? 0)) return prev;
          return { pct: d.progress, scrollY: d.scrollY ?? 0, at: d.savedAt ?? Date.now() };
        });
      })
      .catch(() => {});
  }, [slug, articleId, status]);

  /* ============ التتبع الحي أثناء القراءة ============ */
  useEffect(() => {
    let ticking = false;

    const measure = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const y = Math.max(0, window.scrollY);
      const pct = max > 0 ? Math.min(100, Math.round((y / max) * 100)) : 0;
      latest.current = { pct, scrollY: y };
      setProgress(pct);

      /* بلوغ النهاية يمحو موضع الاستئناف — المقال أُقرأ */
      if (pct >= 96) {
        try {
          window.localStorage.removeItem(lsKey(slug));
        } catch {}
        setResume(null);
        resumed.current = true;
        return;
      }

      /* حفظ محلي خفيف كل تغيّر 2% (بلا إزعاج للتخزين) */
      try {
        const prev = JSON.parse(window.localStorage.getItem(lsKey(slug)) ?? "null") as SavedProgress | null;
        if (!prev || Math.abs(prev.pct - pct) >= 2 || (!resumed.current && pct >= 5)) {
          const payload: SavedProgress = { pct, scrollY: y, at: Date.now() };
          if (pct >= 2) window.localStorage.setItem(lsKey(slug), JSON.stringify(payload));
        }
      } catch {}

      /* مزامنة قاعدة البيانات للمسجلين — كل 20 ثانية كحد أقصى */
      if (status === "authenticated" && Date.now() - lastSaved.current > 20000 && pct >= 2) {
        lastSaved.current = Date.now();
        fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ articleId, progress: pct, scrollY: y }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    };

    /* حفظ أخير عند مغادرة الصفحة */
    const onLeave = () => {
      if (status !== "authenticated") return;
      const { pct, scrollY } = latest.current;
      if (pct < 2 || pct >= 96) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId, progress: pct, scrollY }),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, [slug, articleId, status]);

  const continueReading = useCallback(() => {
    const target = resume?.scrollY || 0;
    window.scrollTo({ top: target, behavior: "smooth" });
    resumed.current = true;
    setResume(null);
  }, [resume]);

  return (
    <>
      {/* عدّاد التقدم الحي — يظهر داخل الشارة إن لم يكن هناك استئناف */}
      {progress > 5 && progress < 96 && !resume && (
        <div
          className="no-print pointer-events-none fixed bottom-[4.75rem] left-1/2 z-30 -translate-x-1/2 rounded-full border px-3.5 py-1.5 text-xs shadow-soft"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-muted)" }}
          aria-hidden
        >
          قرأت {progress}%
        </div>
      )}

      {/* شارة الاستئناف */}
      {resume && (
        <button
          onClick={continueReading}
          className="no-print fixed bottom-[4.75rem] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border py-2 pe-2 ps-4 shadow-lift transition-transform hover:scale-[1.03] animate-fade-up"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          aria-label={`استئناف القراءة من ${resume.pct} بالمئة`}
        >
          <span className="text-xs font-bold" style={{ color: "var(--accent-strong)" }}>
            توقفت عند {resume.pct}%
          </span>
          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
            متابعة القراءة
          </span>
          <span
            className="flex h-7 items-center rounded-full px-3 text-xs font-bold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            متابعة
          </span>
        </button>
      )}
    </>
  );
}
