"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { AudioPlayer } from "@/components/audio-player";
import { QuoteGenerator } from "@/components/quote-generator";
import { QuranBlock, HadithBlock } from "@/components/quran-hadith-blocks";
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
  coverImage: string | null;
  readingTimeSec: number;
};

/* المحلل الموحد: src/lib/content-blocks.ts (فقرات + آيات + أحاديث) */

export function ArticleReader({
  article,
  tashkeelAllowed = true,
}: {
  article: ReaderArticle;
  tashkeelAllowed?: boolean;
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

  /* الحفظ: في مكتبة الحساب المتزامنة + لقطة الجهاز للقراءة دون اتصال */
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    isArticleSaved(article.id).then((v) => { if (alive) setSaved(v); }).catch(() => {});
    if (status === "authenticated") {
      fetch("/api/saves")
        .then((r) => (r.ok ? r.json() : { saves: [] }))
        .then((d) => {
          if (alive && (d.saves ?? []).some((s: { id: string }) => s.id === article.id)) setSaved(true);
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [article.id, status]);

  const handleSave = useCallback(async () => {
    if (saveBusy || saved) return;
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
      /* الحفظ المحلي (لقطة دون اتصال) في كل الأحوال */
      await saveOfflineArticle(snapshot);
      /* الحفظ في مكتبة الحساب المتزامنة للمسجلين */
      if (loggedIn) {
        await fetch("/api/saves", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        }).catch(() => {});
      }
      setSaved(true);
    } catch {}
    setSaveBusy(false);
  }, [article, saved, saveBusy, loggedIn]);

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

  return (
    <div className="relative">
      {/* شريط الأدوات: التشكيل + المختصر + الحفظ + الاقتباس — أهداف لمس مريحة على الموبايل */}
      <div className="page-chrome sticky top-16 z-20 mx-auto -mx-2 mt-8 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-2xl border px-2 py-2 text-sm shadow-soft backdrop-blur-md sm:gap-2 sm:px-3 sm:py-2.5"
        style={{ background: "color-mix(in srgb, var(--surface) 90%, transparent)", borderColor: "var(--border)" }}
      >
        {/* مفتاح التشكيل — يختفي كليًا إذا عطّله الأدمن */}
        {tashkeelAllowed && (
          <button
            onClick={toggleTashkeel}
            role="switch"
            aria-checked={tashkeel}
            className="flex min-h-11 items-center gap-2 rounded-full px-4 py-2 transition-all hover:bg-[var(--accent-soft)] sm:min-h-9 sm:px-3 sm:py-1.5"
            style={{ color: tashkeel ? "var(--accent-strong)" : "var(--ink-muted)" }}
            title="تبديل النص المشكول بالحركات الكاملة"
          >
            <span
              className="relative inline-block h-5 w-9 rounded-full transition-colors duration-300"
              style={{ background: tashkeel ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-300 ease-fluid"
                style={{ right: tashkeel ? "2px" : "18px" }}
              />
            </span>
            التشكيل
          </button>
        )}

        {tashkeelAllowed && (
          <span aria-hidden className="hidden min-h-9 sm:inline" style={{ color: "var(--border)" }}>|</span>
        )}

        {/* المختصر المفيد */}
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="min-h-11 rounded-full px-4 py-2 transition-all hover:bg-[var(--accent-soft)] sm:min-h-9 sm:px-3 sm:py-1.5"
          style={{ color: showSummary ? "var(--accent-strong)" : "var(--ink-muted)" }}
        >
          المختصر المفيد
        </button>

        <span aria-hidden className="hidden min-h-9 sm:inline" style={{ color: "var(--border)" }}>|</span>

        {/* حفظ في مكتبتي */}
        <button
          onClick={handleSave}
          disabled={saved || saveBusy}
          className="min-h-11 rounded-full px-4 py-2 transition-all hover:bg-[var(--accent-soft)] disabled:opacity-60 sm:min-h-9 sm:px-3 sm:py-1.5"
          style={{ color: saved ? "var(--accent-strong)" : "var(--ink-muted)" }}
          title={loggedIn ? "يُحفظ في حسابك (متزامن عبر أجهزتك) + لقطة داخل جهازك للقراءة دون إنترنت" : "حفظ داخل جهازك — سجّل الدخول لتتزامن محفوظاتك عبر أجهزتك"}
        >
          {saved ? "محفوظ في مكتبتي ✓" : "حفظ في مكتبتي"}
        </button>

        <span aria-hidden className="hidden min-h-9 sm:inline" style={{ color: "var(--border)" }}>|</span>

        {/* مولد الاقتباسات */}
        <QuoteGenerator
          articleTitle={article.title}
          articleSlug={article.slug}
          containerSelector="#article-body"
        />
      </div>

      {/* المختصر المفيد */}
      <div
        className={`page-chrome mt-5 overflow-hidden rounded-2xl border transition-all duration-500 ease-fluid ${
          showSummary ? "max-h-[600px] opacity-100" : "max-h-0 border-transparent opacity-0"
        }`}
        style={showSummary ? { background: "var(--bg-soft)", borderColor: "var(--border)" } : undefined}
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

      {/* المشغل الصوتي */}
      {article.audioUrl && (
        <div className="page-chrome mt-8">
          <AudioPlayer
            src={article.audioUrl}
            durationSec={article.audioDurationSec}
            cues={Array.isArray(article.audioCues) ? (article.audioCues as { t: number; id: string }[]) : null}
            blocks={blocks.map((b) => ({ id: b.id, words: blockWordCount(b) }))}
          />
        </div>
      )}

      {/* جسم المقال */}
      <div
        id="article-body"
        className={`article-body mt-10 ${tashkeel ? "is-tashkeel" : ""}`}
        style={{ color: "var(--ink)" }}
      >
        {blocks.map((block) => {
          if (block.kind === "h2") {
            return (
              <h2 key={block.id} id={block.id}>
                {block.text}
              </h2>
            );
          }
          if (block.kind === "quote") {
            return (
              <blockquote key={block.id} id={block.id}>
                {block.text}
              </blockquote>
            );
          }
          if (block.kind === "list") {
            return (
              <ul key={block.id} id={block.id}>
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            );
          }
          if (block.kind === "quran") {
            return (
              <QuranBlock
                key={block.id}
                id={block.id}
                text={block.text}
                sura={block.sura}
                ayah={block.ayah}
              />
            );
          }
          if (block.kind === "hadith") {
            return (
              <HadithBlock
                key={block.id}
                id={block.id}
                text={block.text}
                narrator={block.narrator}
              />
            );
          }
          return (
            <p key={block.id} id={block.id}>
              {block.text}
            </p>
          );
        })}
      </div>

      <div id="article-end-marker" className="h-1" aria-hidden />
    </div>
  );
}
