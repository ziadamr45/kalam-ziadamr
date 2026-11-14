"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const lsKey = (slug: string) => `kalam_progress:${slug}`;

type SavedProgress = { pct: number; scrollY: number; at: number };

function calculateProgress(): number {
  const content = document.getElementById("article-body");
  if (!content) return 0;
  const rect = content.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const totalContentHeight = rect.height;
  const scrolled = windowHeight - rect.top;

  if (scrolled <= 0) return 0;
  if (scrolled >= totalContentHeight) return 100;
  return Math.min(100, Math.max(0, Math.round((scrolled / totalContentHeight) * 100)));
}

export default function ContinueReadingBadge({ slug, articleId }: { slug: string; articleId: string }) {
  const { status } = useSession();
  const [resume, setResume] = useState<SavedProgress | null>(null);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  /* تزامن مع الكبسولة الصوتية العائمة — ترتفع الشارة فوقها تلقائيًا عند تشغيل الصوت */
  const [audioActive, setAudioActive] = useState(false);

  const latest = useRef({ pct: 0, scrollY: 0 });
  const maxMilestone = useRef({ pct: 0, scrollY: 0 });
  const lastSaved = useRef(0);
  const resumed = useRef(false);

  useEffect(() => {
    const onAudio = (e: Event) => {
      const active = Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active);
      setAudioActive(active);
    };
    window.addEventListener("kalam:audio-capsule", onAudio);
    return () => window.removeEventListener("kalam:audio-capsule", onAudio);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lsKey(slug));
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedProgress;
      maxMilestone.current = { pct: saved.pct ?? 0, scrollY: saved.scrollY ?? 0 };
      if (saved.pct >= 5 && saved.pct <= 95 && Date.now() - (saved.at ?? 0) < 90 * 24 * 3600 * 1000) {
        setResume(saved);
      }
    } catch {}

    if (status !== "authenticated") return;
    fetch(`/api/progress?articleId=${encodeURIComponent(articleId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.ok || !d.progress || d.progress < 5 || d.progress > 95) return;
        setResume((prev) => {
          if (prev && prev.at >= (d.savedAt ?? 0)) return prev;
          return { pct: d.progress, scrollY: d.scrollY ?? 0, at: d.savedAt ?? Date.now() };
        });
        maxMilestone.current = {
          pct: Math.max(maxMilestone.current.pct, d.progress),
          scrollY:
            d.progress > maxMilestone.current.pct ? (d.scrollY ?? maxMilestone.current.scrollY) : maxMilestone.current.scrollY,
        };
      })
      .catch(() => {});
  }, [slug, articleId, status]);

  useEffect(() => {
    let ticking = false;

    const measure = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const pct = calculateProgress();
      latest.current = { pct, scrollY: y };
      setProgress(pct);

      if (pct > maxMilestone.current.pct) {
        maxMilestone.current = { pct, scrollY: y };
      }
      const savedMax = maxMilestone.current;

      if (pct >= 96) {
        try {
          window.localStorage.removeItem(lsKey(slug));
        } catch {}
        setResume(null);
        resumed.current = true;
        return;
      }

      try {
        const prev = JSON.parse(window.localStorage.getItem(lsKey(slug)) ?? "null") as SavedProgress | null;
        if (!prev || Math.abs(prev.pct - savedMax.pct) >= 2 || (!resumed.current && savedMax.pct >= 5)) {
          const payload: SavedProgress = { pct: savedMax.pct, scrollY: savedMax.scrollY, at: Date.now() };
          if (savedMax.pct >= 2) window.localStorage.setItem(lsKey(slug), JSON.stringify(payload));
        }
      } catch {}

      if (status === "authenticated" && Date.now() - lastSaved.current > 20000 && savedMax.pct >= 2) {
        lastSaved.current = Date.now();
        fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ articleId, progress: savedMax.pct, scrollY: savedMax.scrollY }),
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

    const onLeave = () => {
      if (status !== "authenticated") return;
      const { pct, scrollY } = maxMilestone.current;
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
      {progress > 5 && progress < 96 && !resume && (
        <div
          className={`no-print pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded-full border px-3.5 py-1.5 text-xs shadow-soft transition-all duration-300 ${
            audioActive ? "bottom-36 sm:bottom-19" : "bottom-19"
          }`}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-muted)" }}
          aria-hidden
        >
          قرأت {progress}%
        </div>
      )}

      {resume && !dismissed && (
        <div
          className={`no-print fixed right-3 z-30 flex items-center gap-2 rounded-full border border-amber-500/30 px-3 py-1.5 shadow-lg backdrop-blur-md transition-all duration-300 animate-fade-up sm:right-4 ${
            audioActive ? "bottom-36 sm:bottom-16" : "bottom-16"
          }`}
          style={{ background: "color-mix(in srgb, var(--surface) 95%, transparent)" }}
          role="group"
          aria-label={`استئناف القراءة من ${resume.pct} بالمئة`}
        >
          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
            توقفت عند{" "}
            <strong className="font-bold" style={{ color: "var(--ink)" }}>
              {resume.pct}%
            </strong>
          </span>
          <button
            onClick={continueReading}
            className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700"
          >
            متابعة القراءة
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-1 text-xs transition-colors"
            style={{ color: "var(--ink-muted)" }}
            aria-label="إغلاق"
            title="إغلاق — يبقى موضع القراءة محفوظًا"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
