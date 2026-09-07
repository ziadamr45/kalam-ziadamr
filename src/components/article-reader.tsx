"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioPlayer } from "@/components/audio-player";
import { QuoteGenerator } from "@/components/quote-generator";
import { trackView, trackComplete, trackDwell } from "@/lib/analytics";
import {
  saveOfflineArticle,
  isArticleSaved,
} from "@/lib/indexeddb";
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

/* ============ فقرات المحتوى من النص الخام ============ */
type Block =
  | { kind: "p"; id: string; text: string }
  | { kind: "h2"; id: string; text: string }
  | { kind: "quote"; id: string; text: string }
  | { kind: "list"; id: string; items: string[] };

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const chunks = raw.split(/\n\n+/);
  let idx = 0;

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const id = `blk-${idx++}`;

    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", id, text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("> ")) {
      blocks.push({ kind: "quote", id, text: trimmed.replace(/^>\s?/gm, "").trim() });
    } else if (/^-\s/m.test(trimmed) && trimmed.split("\n").every((l) => /^-\s/.test(l.trim()))) {
      blocks.push({
        kind: "list",
        id,
        items: trimmed.split("\n").map((l) => l.replace(/^-\s*/, "").trim()),
      });
    } else {
      blocks.push({ kind: "p", id, text: trimmed.replace(/\n/g, " ") });
    }
  }
  return blocks;
}

export function ArticleReader({ article }: { article: ReaderArticle }) {
  /* تبديل التشكيل الفوري */
  const [tashkeel, setTashkeel] = useState(false);
  useEffect(() => {
    try {
      setTashkeel(window.localStorage.getItem("kalam_tashkeel") === "on");
    } catch {}
  }, []);

  const toggleTashkeel = useCallback(() => {
    setTashkeel((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("kalam_tashkeel", next ? "on" : "off");
      } catch {}
      return next;
    });
  }, []);

  /* المختصر المفيد */
  const [showSummary, setShowSummary] = useState(false);

  const source = tashkeel ? article.contentWithTashkeel || article.content : article.content;
  const blocks = useMemo(() => parseBlocks(source), [source]);

  /* الحفظ للقراءة دون اتصال */
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    isArticleSaved(article.id).then(setSaved).catch(() => {});
  }, [article.id]);

  const handleSaveOffline = useCallback(async () => {
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
      setSaved(true);
    } catch {}
  }, [article]);

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
      {/* شريط الأدوات: التشكيل + المختصر + الحفظ + الاقتباس */}
      <div className="page-chrome sticky top-16 z-20 mx-auto -mx-2 mt-8 flex flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm shadow-soft backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--surface) 90%, transparent)", borderColor: "var(--border)" }}
      >
        {/* مفتاح التشكيل */}
        <button
          onClick={toggleTashkeel}
          role="switch"
          aria-checked={tashkeel}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-all hover:bg-[var(--accent-soft)]"
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

        <span aria-hidden style={{ color: "var(--border)" }}>|</span>

        {/* المختصر المفيد */}
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="rounded-full px-3 py-1.5 transition-all hover:bg-[var(--accent-soft)]"
          style={{ color: showSummary ? "var(--accent-strong)" : "var(--ink-muted)" }}
        >
          المختصر المفيد
        </button>

        <span aria-hidden style={{ color: "var(--border)" }}>|</span>

        {/* حفظ دون اتصال */}
        <button
          onClick={handleSaveOffline}
          disabled={saved}
          className="rounded-full px-3 py-1.5 transition-all hover:bg-[var(--accent-soft)] disabled:opacity-60"
          style={{ color: saved ? "var(--accent-strong)" : "var(--ink-muted)" }}
          title="حفظ المقال داخل جهازك للقراءة دون إنترنت"
        >
          {saved ? "محفوظ للقراءة دون اتصال ✓" : "حفظ للقراءة دون اتصال"}
        </button>

        <span aria-hidden style={{ color: "var(--border)" }}>|</span>

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
            blocks={blocks.map((b) => ({ id: b.id, words: b.kind === "list" ? b.items.join(" ").split(/\s+/).length : b.text.split(/\s+/).length }))}
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
