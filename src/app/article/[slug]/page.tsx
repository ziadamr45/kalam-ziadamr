import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ReadingProgress } from "@/components/reading-progress";
import { BackToTop } from "@/components/back-to-top";
import ContinueReadingBadge from "@/components/continue-reading-badge";
import { ArticleCard } from "@/components/article-card";
import { ArticleReader } from "@/components/article-reader";
import { PrintMasthead } from "@/components/print-masthead";
import { CommentsSection } from "@/components/comments-section";
import { DiscussCompanion } from "@/components/discuss-companion";
import { ImpactReadTracker } from "@/components/impact-read-tracker";
import { InteractionSlot } from "@/components/interaction-buttons";
import { displayName, displayAvatar } from "@/lib/identity";
import { requiredReadSeconds } from "@/lib/impact";
import { hasPrivilege } from "@/lib/vip";
import { verificationSealColor, verificationSealLabel, parseSocialLinks } from "@/lib/verification-meta";
import {
  getArticleBySlug,
  safeDecodeSlug,
  getRelatedArticles,
  getApprovedComments,
  getCommentVoteStats,
  getInteractionCounts,
  getPublishedSlugs,
} from "@/lib/db-queries";
import { getSiteConfig } from "@/lib/site-config";
import { formatArabicDate } from "@/lib/utils";
import { formatReadingTime } from "@/lib/readingTime";

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const slugs = await getPublishedSlugs();
    return slugs.map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}

function cleanMetaText(raw: string): string {
  const one = raw.replace(/\s+/g, " ").trim();
  if (one.length <= 165) return one;
  const cut = one.slice(0, 165);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "مقال غير موجود" };

  const metaDescription = cleanMetaText(article.summary);

  return {
    title: article.title,
    description: metaDescription,
    openGraph: {
      type: "article",
      title: article.title,
      description: metaDescription,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      images: [{ url: article.coverImage || "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: metaDescription,
    },
    alternates: { canonical: `/article/${article.slug}` },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const [related, comments, counts, siteCfg, voteStats] = await Promise.all([
    getRelatedArticles(article.id, article.sectionId, 3),
    getApprovedComments(article.id),
    getInteractionCounts(article.id),
    getSiteConfig(),
    getCommentVoteStats(article.id),
  ]);

  const tashkeelAllowed =
    siteCfg.TASHKEEL_ENABLED && article.tashkeelEnabled;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://kalam-ziadamr.vercel.app").replace(/\/$/, "");
  const articleFullUrl = `${siteUrl}/article/${encodeURIComponent(article.slug)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: cleanMetaText(article.summary),
    image: [article.coverImage || `${siteUrl}/og-default.png`],
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "كلام له لازمة" },
    publisher: {
      "@type": "Organization",
      name: "كلام له لازمة",
      logo: { "@type": "ImageObject", url: `${siteUrl}/icons/icon-512.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": articleFullUrl },
    inLanguage: "ar",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />
      <SiteHeader />
      <BackToTop />
      <ContinueReadingBadge slug={article.slug} articleId={article.id} />

      <main className="flex-1">
        <article id="printable-article" className="mx-auto max-w-3xl px-4 pt-28 pb-28 sm:px-6">
          <PrintMasthead url={articleFullUrl} />

          <div className="print-only print-cover-page" aria-hidden>
            {article.section && (
              <span className="print-cover-section">{article.section.name}</span>
            )}
            <div className="print-cover-title">{article.title}</div>
            <div className="print-cover-meta">
              فريق كلام له لازمة · {formatArabicDate(article.publishedAt)} · مدة القراءة المتوقعة:{" "}
              {formatReadingTime(article.readingTimeSec)}
            </div>
            <div className="print-cover-rule" aria-hidden />
            {article.coverImage && (
              <div className="print-cover-figure">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={article.coverImage} alt="" />
              </div>
            )}
            {article.summary.trim() && (
              <div className="print-cover-summary">
                <p className="print-cover-summary-label">المختصر</p>
                {article.summary
                  .split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
              </div>
            )}
          </div>

          {article.section && (
            <div className="page-chrome mb-3 text-center sm:mb-5">
              <Link
                href={`/section/${article.section.slug}`}
                prefetch={true}
                className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {article.section.name}
              </Link>
            </div>
          )}

          <header className="page-chrome text-center">
            <h1
              className="font-body text-3xl font-bold leading-[1.55] sm:text-4xl sm:leading-[1.85]"
              style={{ color: "var(--ink)" }}
            >
              {article.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:mt-5" style={{ color: "var(--ink-muted)" }}>
              <span>فريق كلام له لازمة</span>
              <span aria-hidden>·</span>
              <span>{formatArabicDate(article.publishedAt)}</span>
              <span aria-hidden>·</span>
              <span>مدة القراءة المتوقعة: {formatReadingTime(article.readingTimeSec)}</span>
            </div>
            <div className="mx-auto mt-5 h-[3px] w-16 rounded-full sm:mt-6" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
          </header>

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
              audioWords: article.audioWords,
              coverImage: article.coverImage,
              readingTimeSec: article.readingTimeSec,
            }}
            tashkeelAllowed={tashkeelAllowed}
            audioEnabled={siteCfg.AUDIO_PLAYER_ENABLED}
          />

          {siteCfg.AI_DISCUSS_ENABLED && (
            <DiscussCompanion articleId={article.id} articleTitle={article.title} />
          )}

          <div className="page-chrome no-print mt-10 border-t pt-8" style={{ borderColor: "var(--border)" }}>
            <p className="mb-4 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              هل كان لهذا الكلام لازمة؟
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <InteractionSlot
                articleId={article.id}
                initialLikes={counts.likes}
                initialDislikes={counts.dislikes}
              />
            </div>
          </div>

          <ImpactReadTracker
            articleId={article.id}
            requiredSeconds={requiredReadSeconds(article.content)}
          />

          {siteCfg.COMMENTS_ENABLED ? (
            <CommentsSection
              articleId={article.id}
              articleSlug={article.slug}
              initialComments={comments.map((c) => ({
                id: c.id,
                content: c.content,
                createdAt: c.createdAt.toISOString(),
                authorId: c.user?.id ?? null,
                authorName: displayName(c.user),
                authorImage: displayAvatar(c.user),
                authorRank: c.user?.intellectualRank ?? null,
                isInspiring: c.isInspiring,
                authorVerified: c.user?.isVerified ?? false,
                authorSealColor: c.user?.isVerified
                  ? verificationSealColor(c.user.verificationType)
                  : null,
                authorSealLabel: c.user?.isVerified
                  ? verificationSealLabel(c.user.verificationType, c.user.verificationLabel)
                  : null,
                authorIsVip: c.user?.isVip ?? false,
                authorBadgeTitle: c.user?.vipBadgeTitle ?? null,
                authorBadgeColor: c.user?.vipBadgeColor ?? null,
                authorAccent:
                  c.user && hasPrivilege(c.user.vipPrivileges, "vipCommentBorder")
                    ? c.user.vipBadgeColor
                    : null,
                authorCard:
                  c.user?.isVerified && c.user
                    ? {
                        extendedBio: c.user.extendedBio ?? null,
                        links: parseSocialLinks(c.user.verifiedSocialLinks),
                      }
                    : null,
                selfPinned: Boolean(c.selfPinnedAt),
                likes: voteStats[c.id]?.likes ?? 0,
                dislikes: voteStats[c.id]?.dislikes ?? 0,
              }))}
            />
          ) : (
            <section className="page-chrome no-print mt-12 border-t pt-10 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="rounded-2xl border border-dashed px-6 py-8 text-sm leading-8" style={{ color: "var(--ink-muted)", borderColor: "var(--border)" }}>
                الحوار متوقف مؤقتًا بقرار إداري.. القراءة متاحة كالعادة —
                <br />
                وسيعود الكلام حين تكون له لازمة.
              </p>
            </section>
          )}
          <div className="print-only print-colophon" aria-hidden>
            <div className="print-colophon-ornament">✦</div>
            <p className="print-colophon-line">انتهت هذه النسخة — قراءة هادئة تكون لها لازمة</p>
            <p className="print-colophon-brand">منصة كلام له لازمة · {article.title}</p>
            <p className="print-colophon-url">{`${siteUrl.replace(/^https?:\/\//, "")}/article/${article.slug}`}</p>
          </div>
        </article>

        {related.length > 0 && (
          <section className="page-chrome no-print mx-auto max-w-5xl px-4 pb-24 sm:px-6">
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
      <SiteFooter />
    </>
  );
}
