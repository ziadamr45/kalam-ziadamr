"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getOfflineArticle } from "@/lib/indexeddb";
import type { OfflineArticle } from "@/types/offline";
import { parseBlocks } from "@/lib/content-blocks";
import { ArticleBlocks } from "@/components/markdown-blocks";
import { formatReadingTime } from "@/lib/readingTime";

type LoadState = "loading" | "ready" | "missing";

/**
 * قارئ النسخة المحفوظة على الجهاز — يعمل دون اتصال بالكامل:
 * الصدفة (HTML) مخزّنة مسبقًا في عامل الخدمة، والنص يُقرأ من IndexedDB،
 * والمُعرِّف يصل عبر جزء الرابط (#) فلا يحتاج الخادم شيئًا.
 */
export default function OfflineReader() {
  const [article, setArticle] = useState<(OfflineArticle & { savedAt?: number }) | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [tashkeel, setTashkeel] = useState(false);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
    if (!id) {
      setState("missing");
      return;
    }
    getOfflineArticle(id)
      .then((a) => {
        if (a) {
          setArticle(a);
          setState("ready");
        } else {
          setState("missing");
        }
      })
      .catch(() => setState("missing"));
  }, []);

  const hasTashkeel = Boolean(article?.contentWithTashkeel?.trim());
  const source = article
    ? tashkeel && hasTashkeel
      ? article.contentWithTashkeel
      : article.content
    : "";
  const blocks = useMemo(() => parseBlocks(source), [source]);

  if (state === "loading") {
    return (
      <main className="flex-1">
        <p className="mx-auto max-w-3xl px-4 pt-28 pb-24 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
          جارٍ فتح نسختك المحفوظة..
        </p>
      </main>
    );
  }

  if (state === "missing" || !article) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 pt-28 pb-24 text-center sm:px-6">
          <h1 className="font-body text-2xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            لا توجد نسخة محفوظة على هذا الجهاز
          </h1>
          <p className="mt-3 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
            ربما أُزيل المقال من هذا الجهاز أو حُفظ على جهاز آخر. افتح مقالاتك المحفوظة لتنزيله من جديد.
          </p>
          <Link
            href="/saved"
            className="mt-6 inline-block rounded-full px-6 py-2.5 text-sm font-bold shadow-soft transition-transform hover:scale-105"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            قراءاتي المحفوظة
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <article className="mx-auto max-w-3xl px-4 pt-22 pb-24 sm:px-6 sm:pt-28 sm:pb-28">
        <p
          className="mb-6 rounded-xl border px-4 py-2.5 text-center text-xs font-semibold"
          style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--ink-muted)" }}
        >
          نسخة محفوظة على جهازك — تقرأ الآن دون إنترنت
        </p>

        {article.sectionName && (
          <div className="mb-3 text-center sm:mb-5">
            <span
              className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {article.sectionName}
            </span>
          </div>
        )}

        <header className="text-center">
          <h1
            className="font-body text-3xl font-bold leading-[1.55] sm:text-4xl sm:leading-[1.85]"
            style={{ color: "var(--ink)" }}
          >
            {article.title}
          </h1>
          <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
            {formatReadingTime(article.readingTimeSec)}
          </p>

          {hasTashkeel && (
            <button
              type="button"
              onClick={() => setTashkeel((v) => !v)}
              aria-pressed={tashkeel}
              className="mt-4 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors hover:bg-(--accent-soft)"
              style={{
                borderColor: tashkeel ? "var(--accent)" : "var(--border)",
                color: tashkeel ? "var(--accent-strong)" : "var(--ink-muted)",
              }}
            >
              {tashkeel ? "إخفاء التشكيل" : "عرض التشكيل"}
            </button>
          )}
        </header>

        {article.summary.trim() && (
          <div
            className="my-8 rounded-2xl border p-5 text-sm leading-8"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-muted)" }}
          >
            {article.summary
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((line, i) => (
                <p key={i} className={i > 0 ? "mt-2" : undefined}>
                  {line}
                </p>
              ))}
          </div>
        )}

        <div className={tashkeel ? "tashkeel-ok" : undefined}>
          <ArticleBlocks blocks={blocks} />
        </div>

        <footer className="mt-12 border-t pt-6 text-center text-xs leading-7" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
          <p>
            هذه نسخة القراءة المحفوظة. التعليقات والاستماع وبطاقات الاقتباس متاحة في{" "}
            <Link href={`/article/${article.slug}`} className="underline" style={{ color: "var(--accent-strong)" }}>
              النسخة الكاملة على الموقع
            </Link>{" "}
            عند توفر الاتصال.
          </p>
          <p className="mt-3">
            <Link href="/saved" className="underline" style={{ color: "var(--accent-strong)" }}>
              عودة إلى قراءاتي المحفوظة
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
