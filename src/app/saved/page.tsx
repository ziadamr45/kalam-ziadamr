"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getOfflineArticles, removeOfflineArticle } from "@/lib/indexeddb";
import type { OfflineArticle } from "@/types/offline";
import { formatArabicDate } from "@/lib/utils";
import { formatReadingTime } from "@/lib/readingTime";

export default function SavedPage() {
  const [articles, setArticles] = useState<OfflineArticle[] | null>(null);

  useEffect(() => {
    getOfflineArticles()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);

  const remove = async (id: string) => {
    await removeOfflineArticle(id);
    setArticles((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  };

  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-32 pb-8 text-center sm:px-6">
          <h1 className="font-body text-3xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            قراءاتي المحفوظة
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-muted)" }}>
            محفوظة داخل جهازك — متاحة حتى دون اتصال
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
          {articles === null ? (
            <p className="text-center" style={{ color: "var(--ink-muted)" }}>
              جارٍ التحميل..
            </p>
          ) : articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
              <p className="font-body text-lg leading-9">
                لم تحفظ أي مقال بعد..
                <br />
                اضغط «حفظ للقراءة دون اتصال» أعلى أي مقال يلهث قلبك.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {articles.map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border p-6 shadow-soft"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/article/${a.slug}`} className="group flex-1">
                      <h2 className="font-ui text-lg font-bold transition-colors group-hover:text-[var(--accent)]" style={{ color: "var(--ink)" }}>
                        {a.title}
                      </h2>
                      <p className="font-body mt-1 line-clamp-2 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
                        {a.summary}
                      </p>
                      <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
                        {a.savedAt ? `حُفظ في ${formatArabicDate(new Date(a.savedAt))}` : ""}
                        {a.readingTimeSec ? ` · ${formatReadingTime(a.readingTimeSec)}` : ""}
                      </p>
                    </Link>
                    <button
                      onClick={() => remove(a.id)}
                      aria-label="إزالة المحفوظة"
                      className="rounded-full p-2 transition-colors hover:bg-[var(--accent-soft)]"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
