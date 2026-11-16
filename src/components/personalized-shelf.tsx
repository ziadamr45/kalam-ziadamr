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
  reason: string;
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
            <p className="font-ui flex items-center gap-2.5 text-base font-bold sm:text-lg" style={{ color: "var(--ink)" }}>
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                aria-hidden
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  <path d="M12 7v4M10 9h4" />
                </svg>
              </span>
              الأكثر لازمة بالنسبة لك
            </p>
            <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
              مختار مخصّص لحسابك بحسب قراءاتك واهتماماتك — اضغط {open ? "لإخفائه" : "لعرضه"}
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
          <div className={`mt-5 grid gap-4 border-t pt-5 ${articles.length > 1 ? "sm:grid-cols-2" : ""}`} style={{ borderColor: "var(--border)" }}>
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/article/${a.slug}`}
                prefetch={true}
                className="group block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-(--accent)"
                style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {a.section && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                    >
                      {a.section.name}
                    </span>
                  )}
                  <span className="text-[11px] font-medium" style={{ color: "var(--ink-muted)" }}>
                    • {a.reason}
                  </span>
                </div>
                <h3
                  className="font-ui text-base font-bold leading-7 transition-colors group-hover:text-(--accent)"
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
