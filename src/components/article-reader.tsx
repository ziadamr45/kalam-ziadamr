"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";
import { AudioPlayer } from "@/components/audio-player";
import { QuoteGenerator } from "@/components/quote-generator";
import { mobileReadingToolClass, ReadingToolIcon } from "@/components/reading-tool-card";
import { ArticleBlocks } from "@/components/markdown-blocks";
import { FirstVisitHint } from "@/components/first-visit-hint";
import SearchJump from "@/components/search-jump";
import { trackView, trackComplete, trackDwell } from "@/lib/analytics";
import {
  saveOfflineArticle,
  removeOfflineArticle,
  isArticleSaved,
} from "@/lib/indexeddb";
import { parseBlocks, blockWordCount, blockPlainWords } from "@/lib/content-blocks";
import { stripDiacritics } from "@/lib/utils";
import type { OfflineArticle } from "@/types/offline";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const CLOUDINARY_UPLOAD_PREFIX = "https://res.cloudinary.com/e2umhdt0/image/upload/";
const WATERMARK_TRANSFORM = "l_kalam:brand:watermark-pill,fl_relative,w_0.17,g_south_west,x_16,y_16/";

function withCoverWatermark(url: string | null): string | null {
  if (!url) return null;
  if (!url.startsWith(CLOUDINARY_UPLOAD_PREFIX)) return url;
  if (url.includes("l_kalam:brand:watermark-pill")) return url;
  return `${CLOUDINARY_UPLOAD_PREFIX}${WATERMARK_TRANSFORM}${url.slice(CLOUDINARY_UPLOAD_PREFIX.length)}`;
}

type ReaderArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  contentWithTashkeel: string;
  audioUrl: string | null;
  audioRevision?: string;
  audioDurationSec: number | null;
  audioCues: unknown;
  audioWords: unknown;
  coverImage: string | null;
  readingTimeSec: number;
};

export function ArticleReader({
  article,
  tashkeelAllowed = true,
  audioEnabled = true,
}: {
  article: ReaderArticle;
  tashkeelAllowed?: boolean;
  audioEnabled?: boolean;
}) {
  const [tashkeel, setTashkeel] = useState(false);
  const [tashkeelGateLifted, setTashkeelGateLifted] = useState(false);
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const toolsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    toolsPanelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolsOpen(false);
        toolsButtonRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 640px)").matches) setToolsOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", onResize);
    };
  }, [toolsOpen]);

  useIsomorphicLayoutEffect(() => {
    let prefOn = false;
    try {
      prefOn = tashkeelAllowed && window.localStorage.getItem("kalam_tashkeel") === "on";
    } catch {}
    setTashkeel(prefOn);
    setTashkeelGateLifted(true);
  }, [tashkeelAllowed]);

  useEffect(() => {
    if (!coverLightboxOpen) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCoverLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [coverLightboxOpen]);

  const contentRef = useRef<HTMLDivElement | null>(null);

  const toggleTashkeel = useCallback(() => {
    if (!tashkeelAllowed) return;

    let progress: number | null = null;
    const el = contentRef.current;
    if (el && el.getBoundingClientRect().height > 0) {
      const rect = el.getBoundingClientRect();
      const raw = (window.scrollY - (rect.top + window.scrollY)) / rect.height;
      if (raw > 0 && raw < 1) progress = raw;
    }

    const next = !tashkeel;
    setTashkeel(next);
    try {
      window.localStorage.setItem("kalam_tashkeel", next ? "on" : "off");
      if (next) document.documentElement.setAttribute("data-tashkeel-pref", "on");
      else document.documentElement.removeAttribute("data-tashkeel-pref");
    } catch {}

    if (progress !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el2 = contentRef.current;
          if (!el2) return;
          const newRect = el2.getBoundingClientRect();
          const targetScrollY =
            newRect.top + window.scrollY + newRect.height * progress!;
          const rootStyle = document.documentElement.style;
          const prevBehavior = rootStyle.scrollBehavior;
          rootStyle.scrollBehavior = "auto";
          window.scrollTo(0, targetScrollY);
          rootStyle.scrollBehavior = prevBehavior;
        });
      });
    }
  }, [tashkeelAllowed, tashkeel]);

  const [showSummary, setShowSummary] = useState(false);
  const summaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const summaryPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showSummary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSummary(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showSummary]);

  const source = tashkeel ? article.contentWithTashkeel || article.content : article.content;
  const blocks = useMemo(() => parseBlocks(source), [source]);

  const wordOffsets = useMemo(() => {
    const map = new Map<string, number>();
    let acc = 0;
    for (const b of blocks) {
      map.set(b.id, acc);
      acc += blockWordCount(b);
    }
    return map;
  }, [blocks]);

  const audioWords = useMemo(
    () =>
      Array.isArray(article.audioWords)
        ? (article.audioWords as { w: string; s: number; e: number }[])
        : null,
    [article.audioWords],
  );
  const syncKey = `${article.id}:${tashkeel ? "t" : "p"}:${blocks.length}:${source.length}`;

  const audioMaps = useMemo(() => {
    if (!audioWords || audioWords.length === 0) return null;
    const audio = audioWords.map((w) => stripDiacritics(w.w));
    const gather = (src: string) => {
      const arr: string[] = [];
      try {
        for (const b of parseBlocks(src)) arr.push(...blockPlainWords(b));
      } catch {}
      return arr;
    };
    const tash = gather(article.contentWithTashkeel || article.content).map(stripDiacritics);
    const plain = gather(article.content).map(stripDiacritics);
    const align = (from: string[], to: string[]) => {
      const map = new Array<number>(from.length).fill(-1);
      let j = 0;
      let matched = 0;
      const MAX_SKIP = 40;
      for (let i = 0; i < from.length; i++) {
        const a = from[i];
        if (!a) {
          map[i] = j > 0 ? j - 1 : 0;
          continue;
        }
        let k = j;
        while (k < to.length && k - j <= MAX_SKIP && to[k] !== a) k++;
        if (k < to.length && k - j <= MAX_SKIP) {
          map[i] = k;
          j = k + 1;
          matched++;
        } else {
          map[i] = j > 0 ? j - 1 : 0;
        }
      }
      return { map, rate: from.length ? matched / from.length : 0 };
    };
    const at = align(audio, tash);
    const ap = align(audio, plain);
    const useTash = at.rate >= ap.rate;
    const toDisplay = useTash ? at.map : ap.map;
    const toAudio = new Array<number>((useTash ? tash : plain).length).fill(-1);
    toDisplay.forEach((d, i) => {
      if (d >= 0 && toAudio[d] < 0) toAudio[d] = i;
    });
    return { toDisplay, toAudio, displayIsTashkeel: useTash };
  }, [audioWords, article.content, article.contentWithTashkeel]);

  const needsMap = audioMaps !== null;

  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const [cloudSaved, setCloudSaved] = useState(false);
  const [localSaved, setLocalSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState<"cloud" | "local" | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const anySaved = cloudSaved || localSaved;

  useEffect(() => {
    let alive = true;
    isArticleSaved(article.id).then((v) => { if (alive) setLocalSaved(v); }).catch(() => {});
    if (status === "authenticated") {
      fetch("/api/saves")
        .then((r) => (r.ok ? r.json() : { saves: [] }))
        .then((d) => {
          if (alive && (d.saves ?? []).some((s: { id: string }) => s.id === article.id)) setCloudSaved(true);
        })
        .catch(() => {});
    } else {
      setCloudSaved(false);
    }
    return () => { alive = false; };
  }, [article.id, status]);

  useEffect(() => {
    if (!saveMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSaveMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [saveMenuOpen]);

  const handleSaveCloud = useCallback(async () => {
    if (saveBusy) return;
    if (!loggedIn) {
      requestAuth({ kind: "save" });
      return;
    }
    setSaveBusy("cloud");
    try {
      if (cloudSaved) {
        const res = await fetch("/api/saves", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        });
        if (res.ok) setCloudSaved(false);
      } else {
        const res = await fetch("/api/saves", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        });
        if (res.ok) setCloudSaved(true);
      }
    } catch {}
    setSaveBusy(null);
  }, [article.id, cloudSaved, saveBusy, loggedIn]);

  const saveCloudRef = useRef(handleSaveCloud);
  useEffect(() => {
    saveCloudRef.current = handleSaveCloud;
  });
  useEffect(
    () =>
      onAuthIntent((intent) => {
        if (intent.kind === "save") void saveCloudRef.current();
      }),
    [],
  );

  const handleSaveLocal = useCallback(async () => {
    if (saveBusy) return;
    setSaveBusy("local");
    try {
      if (localSaved) {
        await removeOfflineArticle(article.id);
        setLocalSaved(false);
      } else {
        const snapshot: OfflineArticle = {
          id: article.id,
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          content: article.content,
          contentWithTashkeel: article.contentWithTashkeel,
          readingTimeSec: article.readingTimeSec,
          audioUrl: article.audioUrl,
          sectionName: null,
          sectionSlug: null,
        };
        await saveOfflineArticle(snapshot);
        setLocalSaved(true);
      }
    } catch {}
    setSaveBusy(null);
  }, [article, localSaved, saveBusy]);

  const viewIdRef = useRef<string | null>(null);
  const startRef = useRef<number>(Date.now());
  const completedRef = useRef(false);

  useEffect(() => {
    trackView(article.id, `/article/${article.slug}`).then((id) => {
      viewIdRef.current = id;
    });
    const onLeave = () => {
      const secs = Math.round((Date.now() - startRef.current) / 1000);
      trackDwell(viewIdRef.current, secs);
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [article.id, article.slug]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !completedRef.current) {
            completedRef.current = true;
            const secs = Math.round((Date.now() - startRef.current) / 1000);
            trackComplete(viewIdRef.current, secs, article.id);
          }
        }
      },
      { threshold: 0.6 },
    );
    const el = document.getElementById("article-end-marker");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [article.id]);

  const summaryPoints = useMemo(
    () => article.summary.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    [article.summary],
  );

  const suggestedQuotes = useMemo(() => {
    const quotes: string[] = [];
    for (const line of article.content.split("\n")) {
      const t = line.trim();
      if (t.startsWith("> ")) quotes.push(t.slice(2).trim());
    }
    if (quotes.length < 3) quotes.push(...summaryPoints);
    return Array.from(new Set(quotes.filter((q) => q.length >= 20))).slice(0, 6);
  }, [article.content, summaryPoints]);

  const watermarkedCover = useMemo(() => withCoverWatermark(article.coverImage), [article.coverImage]);

  return (
    <div className={`relative ${tashkeelAllowed ? "tashkeel-ok" : ""}`}>
      {(showSummary || saveMenuOpen || toolsOpen) && (
        <div
          aria-hidden
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowSummary(false);
            setSaveMenuOpen(false);
            setToolsOpen(false);
          }}
          className="page-chrome no-print fixed inset-0 z-35"
        />
      )}

      <div
        id="reading-toolbar"
        className="page-chrome no-print fixed bottom-0 left-0 right-0 z-40 border-t px-2 py-2 backdrop-blur-md sm:px-3"
        style={{
          background: "color-mix(in srgb, var(--bg) 90%, transparent)",
          borderColor: "var(--border)",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-md items-center justify-center gap-3 sm:max-w-(--breakpoint-md) sm:gap-2">
            <div ref={saveMenuRef} className="shrink-0 max-sm:flex-1 sm:relative sm:order-4" data-tour="save-btn">
              <button
                onClick={() => {
                  setToolsOpen(false);
                  setShowSummary(false);
                  setSaveMenuOpen((v) => !v);
                }}
                aria-expanded={saveMenuOpen}
                aria-haspopup="menu"
                className={`min-h-11 whitespace-nowrap rounded-full px-2 py-1 text-sm transition-all hover:bg-(--accent-soft) max-sm:flex max-sm:w-full max-sm:items-center max-sm:justify-center max-sm:gap-2 max-sm:border max-sm:border-(--border) max-sm:bg-(--surface) max-sm:text-(--ink)! sm:px-3 sm:text-sm ${saveMenuOpen ? "bg-(--accent-soft)" : ""}`}
                style={{ color: anySaved ? "var(--accent-strong)" : "var(--ink-muted)" }}
                title="خيارات الحفظ: في حسابك متزامنًا، أو على هذا الجهاز دون إنترنت"
              >
                <svg className="sm:hidden" width="18" height="18" viewBox="0 0 24 24" fill={anySaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z" /></svg>
                <span className="sm:hidden">{anySaved ? "محفوظ ✓" : "حفظ المقال"}</span>
                <span className="hidden sm:inline">{anySaved ? "محفوظ في مكتبتي ✓" : "حفظ في مكتبتي"}</span>
              </button>

              {saveMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-3 right-3 mb-2 max-h-[calc(100dvh-5.5rem)] w-auto max-w-none overflow-y-auto overscroll-contain rounded-2xl border p-2 shadow-lift animate-fade-in sm:left-auto sm:right-0 sm:w-80 sm:max-w-[calc(100vw-2rem)]"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <button
                    role="menuitem"
                    onClick={() => void handleSaveCloud()}
                    disabled={saveBusy !== null}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl p-3 text-right transition-colors hover:bg-(--accent-soft) disabled:cursor-wait disabled:opacity-65"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0" style={{ color: "var(--accent-strong)" }}>
                          <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6.5 6.5 0 0 0-12.7 1.74A4 4 0 0 0 6 19.5h11.5z" />
                        </svg>
                        <span className="truncate">
                          {cloudSaved ? "محفوظ في حسابي ✓" : "حفظ في حسابي"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                        {cloudSaved
                          ? "متزامن عبر كل أجهزتك"
                          : loggedIn
                            ? "مزامنة عبر كل أجهزتك"
                            : "يتطلب تسجيل الدخول — سيُفتح باب الدخول"}
                      </span>
                    </span>
                    {saveBusy === "cloud" ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>
                        <svg className="animate-spin motion-reduce:animate-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        {cloudSaved ? "جارٍ الإلغاء…" : "جارٍ الحفظ…"}
                      </span>
                    ) : cloudSaved ? (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: "rgba(180, 68, 60, 0.1)", color: "#b4443c" }}
                      >
                        إلغاء الحفظ
                      </span>
                    ) : null}
                  </button>

                  <div className="mx-2 my-1 h-px" style={{ background: "var(--border)" }} aria-hidden />

                  <button
                    role="menuitem"
                    onClick={() => void handleSaveLocal()}
                    disabled={saveBusy !== null}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl p-3 text-right transition-colors hover:bg-(--accent-soft) disabled:cursor-wait disabled:opacity-65"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0" style={{ color: "var(--accent-strong)" }}>
                          <rect x="7" y="2" width="10" height="20" rx="2" />
                          <path d="M11 18.5h2" />
                        </svg>
                        <span className="truncate">
                          {localSaved ? "محفوظ على هذا الجهاز ✓" : "حفظ على هذا الجهاز"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                        {localSaved
                          ? "متاح بدون إنترنت"
                          : "قراءة بدون إنترنت على هذا المتصفح"}
                      </span>
                    </span>
                    {saveBusy === "local" ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>
                        <svg className="animate-spin motion-reduce:animate-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        {localSaved ? "جارٍ الإلغاء…" : "جارٍ الحفظ…"}
                      </span>
                    ) : localSaved ? (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: "rgba(180, 68, 60, 0.1)", color: "#b4443c" }}
                      >
                        إلغاء الحفظ
                      </span>
                    ) : null}
                  </button>
                </div>
              )}
            </div>
          <button
            ref={toolsButtonRef}
            type="button"
            aria-expanded={toolsOpen}
            aria-controls="reading-tools-panel"
            aria-label="أدوات القراءة"
            data-tour="reading-tools-btn"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-(--accent)/25 bg-(--accent-soft) px-4 py-2 text-sm font-semibold text-(--accent-strong) transition-colors hover:border-(--accent) sm:hidden"
            onClick={() => {
              setShowSummary(false);
              setSaveMenuOpen(false);
              setToolsOpen((value) => !value);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2" /><circle cx="13" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></svg>
            <span>أدوات</span>
          </button>
          <div
            id="reading-tools-panel"
            ref={toolsPanelRef}
            role={toolsOpen ? "region" : undefined}
            aria-label={toolsOpen ? "أدوات القراءة" : undefined}
            className={`${toolsOpen ? "grid" : "hidden"} absolute inset-x-3 bottom-full mb-3 max-h-[calc(100dvh-7rem)] grid-cols-2 gap-2.5 overflow-y-auto rounded-3xl border p-4 shadow-lift max-sm:[&_.tashkeel-toggle-label]:text-sm sm:contents`}
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="col-span-2 mb-1 flex items-center justify-between border-b border-(--border) pb-2 sm:hidden">
              <h2 className="text-sm font-bold">أدوات القراءة</h2>
              <button type="button" aria-label="إغلاق أدوات القراءة" className="min-h-11 min-w-11 rounded-full hover:bg-(--accent-soft)" onClick={() => { setToolsOpen(false); toolsButtonRef.current?.focus(); }}>✕</button>
            </div>
          {tashkeelAllowed && (
            <>
              <button
                onClick={toggleTashkeel}
                role="switch"
                aria-checked={tashkeel}
                data-tour="tashkeel-btn"
                className={`${mobileReadingToolClass} flex shrink-0 cursor-pointer items-center sm:order-1 gap-1 rounded-full px-1.5 py-2 transition-all hover:bg-(--accent-soft) sm:gap-1.5 sm:px-2 ${tashkeel ? "max-sm:border-(--accent)! max-sm:bg-(--accent-soft)!" : ""}`}
                title="تبديل النص المشكول بالحركات الكاملة"
              >
                <ReadingToolIcon kind="tashkeel" />
                <span className="flex items-center gap-2">
                <span className="tashkeel-toggle-label text-[11px] font-medium sm:text-xs">
                  تشكيل
                </span>
                <span className="tashkeel-toggle-track relative inline-block h-5 w-8 shrink-0 rounded-full transition-colors duration-300 sm:w-9">
                  <span className="tashkeel-toggle-knob absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-fluid" />
                </span>
                </span>
              </button>
              <span className="hidden h-4 w-px shrink-0 sm:block sm:order-2" style={{ background: "var(--border)" }} aria-hidden />
            </>
          )}


            <button
              ref={summaryBtnRef}
              onClick={() => {
                setToolsOpen(false);
                setSaveMenuOpen(false);
                setShowSummary((v) => !v);
              }}
              aria-expanded={showSummary}
              data-tour="summary-btn"
              className={`${mobileReadingToolClass} sm:order-3 min-h-11 shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] transition-all hover:bg-(--accent-soft) sm:px-3 sm:text-sm`}
              style={{ color: showSummary ? "var(--accent-strong)" : "var(--ink-muted)" }}
            >
              <ReadingToolIcon kind="summary" />
              <span className="sm:hidden">المختصر المفيد</span>
              <span className="hidden sm:inline">المختصر المفيد</span>
            </button>



            <button
              type="button"
              onClick={() => { setToolsOpen(false); window.print(); }}
              data-tour="pdf-btn"
              className={`${mobileReadingToolClass} sm:order-5 min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-2 py-1 text-[11px] transition-all hover:bg-(--accent-soft) sm:px-3 sm:text-sm`}
              style={{ color: "var(--ink-muted)" }}
              title="نسخة ورقية رسمية بمحرك الطباعة الأصيل للمتصفح — اختر «حفظ كـ PDF» من نافذة الطباعة"
            >
              <ReadingToolIcon kind="pdf" />
              <span className="sm:hidden">حفظ PDF</span>
              <span className="hidden sm:inline">طباعة / حفظ PDF</span>
            </button>

            <div className="flex min-h-11 items-center max-sm:[&>button]:w-full sm:order-6" data-tour="quote-btn" onClick={() => setToolsOpen(false)}>
              <QuoteGenerator
                articleId={article.id}
                articleTitle={article.title}
                articleSlug={article.slug}
                articleCover={article.coverImage}
                containerSelector="#article-body"
                suggestedQuotes={suggestedQuotes}
                readingTool
              />
            </div>


          </div>
        </div>
      </div>

      <div
        className={`page-chrome no-print fixed inset-x-0 bottom-[68px] z-40 px-3 transition-all duration-300 ease-fluid sm:px-6 ${
          showSummary ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-hidden={!showSummary}
      >
        <div
          ref={summaryPanelRef}
          className="mx-auto max-w-3xl rounded-2xl border shadow-lift"
          style={showSummary ? { background: "var(--surface)", borderColor: "var(--border)" } : { borderColor: "transparent" }}
        >
          <div className="p-6">
            <p className="font-ui mb-3 text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
              المختصر المفيد
            </p>
            <ul className="space-y-2.5">
              {summaryPoints.map((point, i) => {
                const colonIdx = point.indexOf(":");
                const hasLabel = colonIdx > 0 && colonIdx <= 28;
                const label = hasLabel ? point.slice(0, colonIdx) : null;
                const body = hasLabel ? point.slice(colonIdx + 1).trim() : point;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <span className="font-body leading-9" style={{ color: "var(--ink)" }}>
                      {label && (
                        <strong className="font-ui ml-1.5 text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
                          {label}:
                        </strong>
                      )}
                      {body}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <FirstVisitHint
        id="article-tools"
        mode="tour"
        steps={[
          {
            selector: "#article-body",
            title: "من هنا تقرأ المقال",
            text: "اقرأ النص بهدوء، وبالتمرير للأسفل يُحفظ موضع قراءتك تلقائيًا لتستأنفه في أي وقت.",
          },
          {
            selector: "[data-tour='reading-tools-btn']",
            title: "أدوات القراءة",
            text: "افتح هذه اللوحة للتشكيل والمختصر المفيد وحفظ PDF وصنع بطاقة اقتباس.",
          },
          {
            selector: "[data-tour='tashkeel-btn']",
            title: "مفتاح التشكيل",
            text: "من هنا يمكنك إظهار الحركات الكاملة أو إخفاؤها بضغطة واحدة دون أن تفقد موضع قراءتك.",
          },
          {
            selector: "[data-tour='summary-btn']",
            title: "المختصر المفيد",
            text: "من هنا تفتح خلاصة المقال وأهم نقاطه العملية في لمحة سريعة.",
          },
          {
            selector: "[data-tour='save-btn']",
            title: "حفظ المقال",
            text: "من هنا تحفظ المقال في حسابك للمزامنة بين أجهزتك، أو تحفظه على هذا الجهاز للقراءة بدون إنترنت.",
          },
          {
            selector: "[data-tour='pdf-btn']",
            title: "طباعة أو حفظ PDF",
            text: "من هنا تحفظ المقال كملف PDF منسّق وجاهز للقراءة أو الطباعة في أي وقت.",
          },
          {
            selector: "[data-tour='quote-btn']",
            title: "اقتباس ومشاركة",
            text: "من هنا تصمّم بطاقة اقتباس مصوّرة بهوية المنصة لمشاركتها مباشرة.",
          },
          {
            selector: "[data-tour='discuss-trigger']",
            title: "ناقش أفكار المقال",
            text: "بعد القراءة، من هنا تفتح حوارًا ذكيًا مع المحاور الفكري لمناقشة أفكار المقال بلغتك ولهجتك.",
          },
        ]}
      />

      {watermarkedCover && (
        <div className="print-cover page-chrome mt-8 overflow-hidden rounded-2xl shadow-soft">
          <button
            type="button"
            onClick={() => setCoverLightboxOpen(true)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={`عرض غلاف المقال كاملًا: ${article.title}`}
            title="اضغط لعرض الغلاف كاملًا"
            className="block w-full cursor-zoom-in focus:outline-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={watermarkedCover}
              alt={article.title}
              draggable={false}
              className="pointer-events-none w-full select-none object-cover"
              loading="eager"
            />
          </button>
        </div>
      )}

      {coverLightboxOpen && watermarkedCover && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`غلاف: ${article.title}`}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed inset-0 z-90 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setCoverLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setCoverLightboxOpen(false)}
            aria-label="إغلاق معاينة الغلاف"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={watermarkedCover}
            alt={article.title}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="max-h-[85dvh] max-w-[92vw] select-none rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {audioEnabled && article.audioUrl && (
        <div className="page-chrome mt-8">
          <AudioPlayer
            key={article.audioRevision ? `${article.audioRevision}:${article.audioUrl}` : undefined}
            audioRevision={article.audioRevision}
            src={article.audioUrl}
            durationSec={article.audioDurationSec}
            cues={Array.isArray(article.audioCues) ? (article.audioCues as { t: number; id: string }[]) : null}
            blocks={blocks.map((b) => ({ id: b.id, words: blockWordCount(b) }))}
            words={audioWords}
            highlightMap={needsMap ? (audioMaps?.toDisplay ?? null) : null}
            jumpMap={needsMap ? (audioMaps?.toAudio ?? null) : null}
            slug={article.slug}
            syncKey={syncKey}
            title={article.title}
            coverImage={article.coverImage}
          />
        </div>
      )}

      <div
        ref={contentRef}
        id="article-body"
        className={`article-body mt-10 pb-8 sm:pb-10 ${tashkeel ? "is-tashkeel" : ""} ${
          tashkeelGateLifted ? "tashkeel-gate-lifted" : ""
        }`}
        style={{ color: "var(--ink)" }}
      >
        <ArticleBlocks blocks={blocks} offsets={wordOffsets} />
      </div>

      <Suspense fallback={null}>
        <SearchJump version={syncKey} />
      </Suspense>

      <div id="article-end-marker" className="h-1" aria-hidden />
    </div>
  );
}