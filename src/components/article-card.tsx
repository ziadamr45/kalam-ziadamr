import Link from "next/link";
import { easternDigits, formatArabicDate } from "@/lib/utils";
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
        className="font-ui text-lg font-bold leading-9 transition-colors group-hover:text-[var(--accent)]"
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
        className="mt-4 flex items-center gap-3 text-xs"
        style={{ color: "var(--ink-muted)" }}
      >
        {article.publishedAt && <span>{formatArabicDate(article.publishedAt)}</span>}
        <span aria-hidden>·</span>
        <span>{formatReadingTime(article.readingTimeSec)}</span>
      </div>
    </Link>
  );
}
