"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";
import { AudioPlayer } from "@/components/audio-player";
import { QuoteGenerator } from "@/components/quote-generator";
import { ArticleBlocks } from "@/components/markdown-blocks";
import { trackView, trackComplete, trackDwell } from "@/lib/analytics";
import {
  saveOfflineArticle,
  isArticleSaved,
} from "@/lib/indexeddb";
import { parseBlocks, blockWordCount, type Block } from "@/lib/content-blocks";
import type { OfflineArticle } from "@/types/offline";

type ReaderArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  contentWithTashkeel: string;
  audioUrl: string | null;
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
  /** مفتاح السيادة: إظهار/إخفاء المشغل الصوتي من التكوين السيادي */
  audioEnabled?: boolean;
}) {
  /* تبديل التشكيل الفوري — مرهون بإذن الأدمن (عامًا + لهذا المقال) */
  const [tashkeel, setTashkeel] = useState(false);
  useEffect(() => {
    try {
      setTashkeel(tashkeelAllowed && window.localStorage.getItem("kalam_tashkeel") === "on");
    } catch {}
  }, [tashkeelAllowed]);

  const toggleTashkeel = useCallback(() => {
    if (!tashkeelAllowed) return;
    setTashkeel((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("kalam_tashkeel", next ? "on" : "off");
      } catch {}
      return next;
    });
  }, [tashkeelAllowed]);

  /* المختصر المفيد */
  const [showSummary, setShowSummary] = useState(false);

  const source = tashkeel ? article.contentWithTashkeel || article.content : article.content;
  const blocks = useMemo(() => parseBlocks(source), [source]);

  /* فهرس البداية العام لكل كتلة — يمتد عبر كل الكتل حتى الآيات والأحاديث (تُقرأ لكن لا تُظلل كلمةً كلمة) */
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
  /* مفتاح إعادة مسح عناصر الكلمات في المشغل عند أي تغيير في العرض */
  const syncKey = `${article.id}:${tashkeel ? "t" : "p"}:${blocks.length}:${source.length}`;

  /* الحفظ: منظومة مزدوجة مستقلة — مزامنة سحابية في الحساب + لقطة محلية على الجهاز،
     ولكلٍّ منفذُه الخاص وقائمته المفهومة (لا دمج عشوائي بين القناتين) */
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const [cloudSaved, setCloudSaved] = useState(false);
  const [localSaved, setLocalSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
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

  /* إغلاق قائمة الحفظ عند النقر خارجها */
  useEffect(() => {
    if (!saveMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) setSaveMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [saveMenuOpen]);

  /* حفظ سحابي في مكتبة الحساب — يتطلب جلسة حية */
  const handleSaveCloud = useCallback(async () => {
    if (saveBusy || cloudSaved) return;
    if (!loggedIn) {
      /* بوابة المصادقة: الحفظ السحابي للأعضاء — نافذة ذكية تحتفظ بنية الحفظ */
      requestAuth({ kind: "save" });
      return;
    }
    setSaveBusy(true);
    try {
      await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      setCloudSaved(true);
    } catch {}
    setSaveBusy(false);
  }, [article.id, article.slug, cloudSaved, saveBusy, loggedIn]);

  /* تنفيذ النية المحفوظة — عاد المستخدم من الدخول ليُكمل الحفظ تلقائيًا */
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

  /* حفظ لقطة محلية على هذا الجهاز — للقراءة دون اتصال */
  const handleSaveLocal = useCallback(async () => {
    if (saveBusy || localSaved) return;
    setSaveBusy(true);
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
    try {
      await saveOfflineArticle(snapshot);
      setLocalSaved(true);
    } catch {}
    setSaveBusy(false);
  }, [article, localSaved, saveBusy]);

  /* تتبع القراءة: زيارة، إكمال، بقاء */
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

  /* الإكمال: وصول القارئ لنهاية المقال */
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

  /* اقتباسات مقترحة لمولد البطاقات: سطور الاقتباس (> ) في متن المقال
     ثم نقاط المختصر — لتفتح للقارئ بديلًا ذكيًا عند غياب التحديد */
  const suggestedQuotes = useMemo(() => {
    const quotes: string[] = [];
    for (const line of article.content.split("\n")) {
      const t = line.trim();
      if (t.startsWith("> ")) quotes.push(t.slice(2).trim());
    }
    if (quotes.length < 3) quotes.push(...summaryPoints);
    return Array.from(new Set(quotes.filter((q) => q.length >= 20))).slice(0, 6);
  }, [article.content, summaryPoints]);

  return (
    <div className="relative">
      {/* شريط أدوات القراءة — مثبت أسفل الشاشة: مفتاح التشكيل مثبّت في المقدمة
          دون انقطاع، والأزرار التنفيذية مجموعة مرنة لا تخرج عن إطار الشاشة */}
      <div
        className="page-chrome no-print fixed bottom-0 left-0 right-0 z-40 border-t px-3 py-2 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--bg) 90%, transparent)",
          borderColor: "var(--border)",
        }}
      >
        <div className="mx-auto flex max-w-screen-md items-center justify-between gap-1 sm:gap-3">
          {/* مفتاح التشكيل ثابت في المقدمة (يمين الشاشة) دون زحزحة إطلاقًا */}
          {tashkeelAllowed && (
            <button
              onClick={toggleTashkeel}
              role="switch"
              aria-checked={tashkeel}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-1.5 py-2 transition-all hover:bg-[var(--accent-soft)] sm:px-2"
              title="تبديل النص المشكول بالحركات الكاملة"
            >
              <span className="text-xs font-medium" style={{ color: tashkeel ? "var(--accent-strong)" : "var(--ink-muted)" }}>
                تشكيل
              </span>
              <span
                className="relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors duration-300"
                style={{ background: tashkeel ? "var(--accent)" : "var(--border)" }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-300 ease-fluid"
                  style={{ right: tashkeel ? "2px" : "18px" }}
                />
              </span>
            </button>
          )}

          {/* الأزرار التنفيذية — متناسقة الحجم بمسافات مرنة */}
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            {/* المختصر المفيد */}
            <button
              onClick={() => setShowSummary((v) => !v)}
              className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs transition-all hover:bg-[var(--accent-soft)] sm:px-3 sm:text-sm"
              style={{ color: showSummary ? "var(--accent-strong)" : "var(--ink-muted)" }}
            >
              <span className="sm:hidden">المختصر</span>
              <span className="hidden sm:inline">المختصر المفيد</span>
            </button>

            {/* حفظ — قائمة مزدوجة واضحة: سحابي في الحساب + محلي على الجهاز */}
            <div ref={saveMenuRef} className="relative shrink-0">
              <button
                onClick={() => setSaveMenuOpen((v) => !v)}
                aria-expanded={saveMenuOpen}
                aria-haspopup="menu"
                className={`min-h-11 whitespace-nowrap rounded-full px-2 py-1 text-xs transition-all hover:bg-[var(--accent-soft)] sm:px-3 sm:text-sm ${saveMenuOpen ? "bg-[var(--accent-soft)]" : ""}`}
                style={{ color: anySaved ? "var(--accent-strong)" : "var(--ink-muted)" }}
                title="خيارات الحفظ: في حسابك متزامنًا، أو على هذا الجهاز دون إنترنت"
              >
                <span className="sm:hidden">{anySaved ? "محفوظ ✓" : "حفظ"}</span>
                <span className="hidden sm:inline">{anySaved ? "محفوظ في مكتبتي ✓" : "حفظ في مكتبتي"}</span>
              </button>

              {saveMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 mb-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-lift animate-fade-in"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  {/* الخيار السحابي — مزامنة الحساب */}
                  <button
                    role="menuitem"
                    onClick={() => void handleSaveCloud()}
                    disabled={cloudSaved || saveBusy}
                    className="w-full rounded-xl p-3 text-right transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-65"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--accent-strong)" }}>
                          <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6.5 6.5 0 0 0-12.7 1.74A4 4 0 0 0 6 19.5h11.5z" />
                        </svg>
                        حفظ في حسابي (مزامنة سحابية)
                      </span>
                      {cloudSaved && (
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>✓ محفوظ</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                      {loggedIn
                        ? "للوصول إليه من أي جهاز عند تسجيل الدخول"
                        : "يتطلب تسجيل الدخول — سيُفتح باب الدخول"}
                    </span>
                  </button>

                  <div className="mx-2 my-1 h-px" style={{ background: "var(--border)" }} aria-hidden />

                  {/* الخيار المحلي — لقطة هذا الجهاز دون اتصال */}
                  <button
                    role="menuitem"
                    onClick={() => void handleSaveLocal()}
                    disabled={localSaved || saveBusy}
                    className="w-full rounded-xl p-3 text-right transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-65"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--accent-strong)" }}>
                          <rect x="7" y="2" width="10" height="20" rx="2" />
                          <path d="M11 18.5h2" />
                        </svg>
                        حفظ على هذا الجهاز (قراءة بدون إنترنت)
                      </span>
                      {localSaved && (
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>✓ محفوظ</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                      للقراءة في أي وقت بدون اتصال على هذا المتصفح
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* تحميل المقال كـ PDF — ورقة طباعة قارئة بهوامش متزنة يولّدها المتصفح */}
            <button
              onClick={() => window.print()}
              className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs transition-all hover:bg-[var(--accent-soft)] sm:px-3 sm:text-sm"
              style={{ color: "var(--ink-muted)" }}
              title="نسخة منسقة بعناية للطباعة أو الحفظ PDF"
            >
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">تحميل كـ PDF</span>
            </button>

            {/* مولد الاقتباسات */}
            <div className="flex min-h-11 items-center">
              <QuoteGenerator
                articleId={article.id}
                articleTitle={article.title}
                articleSlug={article.slug}
                articleCover={article.coverImage}
                containerSelector="#article-body"
                suggestedQuotes={suggestedQuotes}
              />
            </div>
          </div>
        </div>
      </div>

      {/* المختصر المفيد — لوحة عائمة تنبثق فوق شريط الأدوات السفلي */}
      <div
        className={`page-chrome no-print fixed inset-x-0 bottom-[68px] z-40 px-3 transition-all duration-300 ease-fluid sm:px-6 ${
          showSummary ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-hidden={!showSummary}
      >
        <div
          className="mx-auto max-w-3xl rounded-2xl border shadow-lift"
          style={showSummary ? { background: "var(--surface)", borderColor: "var(--border)" } : { borderColor: "transparent" }}
        >
          <div className="p-6">
            <p className="font-ui mb-3 text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
              المختصر المفيد
            </p>
            <ul className="space-y-2.5">
              {summaryPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                  <span className="font-body leading-9" style={{ color: "var(--ink)" }}>
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* صورة الغلاف */}
      {article.coverImage && (
        <div className="page-chrome mt-8 overflow-hidden rounded-2xl shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImage}
            alt={article.title}
            className="w-full object-cover"
            loading="eager"
          />
        </div>
      )}

      {/* المشغل الصوتي — يخضع لمفتاح التكوين السيادي AUDIO_PLAYER_ENABLED */}
      {audioEnabled && article.audioUrl && (
        <div className="page-chrome mt-8">
          <AudioPlayer
            src={article.audioUrl}
            durationSec={article.audioDurationSec}
            cues={Array.isArray(article.audioCues) ? (article.audioCues as { t: number; id: string }[]) : null}
            blocks={blocks.map((b) => ({ id: b.id, words: blockWordCount(b) }))}
            words={audioWords}
            slug={article.slug}
            syncKey={syncKey}
            title={article.title}
            coverImage={article.coverImage}
          />
        </div>
      )}

      {/* جسم المقال — العارض الموحد لمحرك التنسيق الموسع (كاريوكي آمن)
          مسافة سفلية واسعة (pb-32) حتى لا تحجب الكبسولة العائمة السطور الأخيرة أبدًا */}
      <div
        id="article-body"
        className={`article-body mt-10 pb-32 ${tashkeel ? "is-tashkeel" : ""}`}
        style={{ color: "var(--ink)" }}
      >
        <ArticleBlocks blocks={blocks} offsets={wordOffsets} />
      </div>

      <div id="article-end-marker" className="h-1" aria-hidden />
    </div>
  );
}
