"use client";

import { useState } from "react";
import Link from "next/link";
import { formatReadingTime } from "@/lib/readingTime";

export type PersonalizedArticleItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  readingTimeSec: number;
  section: { name: string; slug: string } | null;
};

export function PersonalizedShelf({ articles }: { articles: PersonalizedArticleItem[] }) {
  const [open, setOpen] = useState(false);
  if (articles.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <div
        className="rounded-3xl border p-5 shadow-soft transition-all sm:p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center justify-between gap-4 text-right"
        >
          <div className="min-w-0">
            <p className="font-ui flex items-center gap-2 text-base font-bold sm:text-lg" style={{ color: "var(--ink)" }}>
              <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="16 14 96 112" fill="none">
                  <path
                    d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
                    fill="currentColor"
                  />
                  <path d="M80.5 120.5 L46.5 120.5" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
                </svg>
              </span>
              الأكثر لازمة بالنسبة لك
            </p>
            <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
              مختارات مخصّصة لحسابك بحسب قراءاتك واهتماماتك — اضغط {open ? "لإخفائها" : "لعرضها"}
            </p>
          </div>
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-transform duration-300"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-soft)",
              color: "var(--accent-strong)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {open && (
          <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/article/${a.slug}`}
                prefetch={true}
                className="group block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-(--accent)"
                style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
              >
                {a.section && (
                  <span
                    className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                  >
                    {a.section.name}
                  </span>
                )}
                <h3
                  className="font-ui text-sm font-bold leading-7 transition-colors group-hover:text-(--accent)"
                  style={{ color: "var(--ink)" }}
                >
                  {a.title}
                </h3>
                <p className="font-body mt-1.5 line-clamp-2 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                  {a.summary}
                </p>
                <span className="mt-2.5 block text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  {formatReadingTime(a.readingTimeSec)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
