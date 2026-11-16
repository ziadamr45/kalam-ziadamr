import Link from "next/link";
import { formatArabicDate } from "@/lib/utils";
import { formatReadingTime } from "@/lib/readingTime";

export type ArticleCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  readingTimeSec: number;
  publishedAt: Date | null;
  section: { name: string; slug: string } | null;
};

export function ArticleCard({ article, index = 0 }: { article: ArticleCardData; index?: number }) {
  return (
    <Link
      href={`/article/${article.slug}`}
      /* تحميل مسبق ذكي: بمجرد ظهور البطاقة في الشاشة يجهز كود وبيانات المقال
         في الخلفية — النقر يفتح المقال فورًا في أجزاء من الثانية */
      prefetch={true}
      data-tour={index === 0 ? "first-article" : undefined}
      className="group block rounded-2xl border p-6 shadow-soft transition-all duration-500 ease-fluid hover:-translate-y-1 hover:shadow-lift animate-fade-up"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        animationDelay: `${Math.min(index, 8) * 60}ms`,
      }}
    >
      {article.section && (
        <span
          className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
        >
          {article.section.name}
        </span>
      )}
      <h3
        className="font-ui text-lg font-bold leading-9 transition-colors group-hover:text-(--accent)"
        style={{ color: "var(--ink)" }}
      >
        {article.title}
      </h3>
      <p
        className="font-body mt-2 line-clamp-2 text-[15px] leading-8"
        style={{ color: "var(--ink-muted)" }}
      >
        {article.summary}
      </p>
      <div
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
        style={{ color: "var(--ink-muted)" }}
      >
        {article.publishedAt && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            {formatArabicDate(article.publishedAt)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {formatReadingTime(article.readingTimeSec)}
        </span>
      </div>
    </Link>
  );
}
