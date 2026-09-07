import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ReadingProgress } from "@/components/reading-progress";
import { BackToTop } from "@/components/back-to-top";
import { ArticleCard } from "@/components/article-card";
import { ArticleReader } from "@/components/article-reader";
import { CommentsSection } from "@/components/comments-section";
import { InteractionSlot } from "@/components/interaction-buttons";
import {
  getArticleBySlug,
  getPublishedSlugs,
  getRelatedArticles,
  getApprovedComments,
  getInteractionCounts,
  getMyVote,
} from "@/lib/db-queries";
import { auth } from "@/lib/auth";
import { formatArabicDate } from "@/lib/utils";
import { formatReadingTime } from "@/lib/readingTime";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "مقال غير موجود" };

  return {
    title: article.title,
    description: article.summary,
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.publishedAt?.toISOString(),
      images: [{ url: article.coverImage || "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary,
    },
    alternates: { canonical: `/article/${article.slug}` },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const [related, comments, counts, session] = await Promise.all([
    getRelatedArticles(article.id, article.sectionId, 3),
    getApprovedComments(article.id),
    getInteractionCounts(article.id),
    auth(),
  ]);

  const myVote = await getMyVote(article.id, {
    userId: session?.user?.id ?? null,
    visitorFp: null,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt?.toISOString(),
    author: { "@type": "Organization", name: "كلام له لازمة" },
    publisher: { "@type": "Organization", name: "كلام له لازمة" },
    inLanguage: "ar",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />
      <Header />
      <BackToTop />

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 pt-28 pb-10 sm:px-6">
          {/* تصنيف القسم */}
          {article.section && (
            <div className="page-chrome mb-6 text-center">
              <a
                href={`/section/${article.section.slug}`}
                className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {article.section.name}
              </a>
            </div>
          )}

          {/* العنوان وسطر البيانات */}
          <header className="page-chrome text-center">
            <h1
              className="font-body text-3xl font-bold leading-[1.9] sm:text-4xl sm:leading-[1.9]"
              style={{ color: "var(--ink)" }}
            >
              {article.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              <span>فريق كلام له لازمة</span>
              <span aria-hidden>·</span>
              <span>{formatArabicDate(article.publishedAt)}</span>
              <span aria-hidden>·</span>
              <span>مدة القراءة المتوقعة: {formatReadingTime(article.readingTimeSec)}</span>
            </div>
            <div className="mx-auto mt-6 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
          </header>

          {/* القارئ التفاعلي الكامل */}
          <ArticleReader
            article={{
              id: article.id,
              slug: article.slug,
              title: article.title,
              summary: article.summary,
              content: article.content,
              contentWithTashkeel: article.contentWithTashkeel,
              audioUrl: article.audioUrl,
              audioDurationSec: article.audioDurationSec,
              audioCues: article.audioCues,
              coverImage: article.coverImage,
              readingTimeSec: article.readingTimeSec,
            }}
          />

          {/* التفاعل والمشاركة */}
          <div className="page-chrome mt-10 border-t pt-8" style={{ borderColor: "var(--border)" }}>
            <p className="mb-4 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              هل كان لهذا الكلام لازمة؟
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <InteractionSlot
                articleId={article.id}
                initialLikes={counts.likes}
                initialDislikes={counts.dislikes}
                initialMyVote={myVote}
              />
            </div>
          </div>

          {/* التعليقات */}
          <CommentsSection
            articleId={article.id}
            articleSlug={article.slug}
            initialComments={comments.map((c) => ({
              id: c.id,
              content: c.content,
              createdAt: c.createdAt.toISOString(),
              authorName: c.user?.name || c.guestName || "قارئ",
              authorImage: c.user?.image || null,
            }))}
            isLoggedIn={Boolean(session?.user)}
          />
        </article>

        {/* مقالات ذات صلة */}
        {related.length > 0 && (
          <section className="page-chrome mx-auto max-w-5xl px-4 pb-24 sm:px-6">
            <h2 className="font-ui mb-6 text-xl font-bold" style={{ color: "var(--ink)" }}>
              كلامٌ آخر له لازمة
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              {related.map((a, i) => (
                <ArticleCard
                  key={a.id}
                  index={i}
                  article={{
                    id: a.id,
                    slug: a.slug,
                    title: a.title,
                    summary: a.summary,
                    readingTimeSec: a.readingTimeSec,
                    publishedAt: a.publishedAt,
                    section: a.section ? { name: a.section.name, slug: a.section.slug } : null,
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
