import type {
  Article,
  Comment,
  Prisma,
  Section,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ArticleWithSection = Article & { section: Section | null };

const publishedWhere: Prisma.ArticleWhereInput = {
  OR: [
    { status: "PUBLISHED", publishedAt: { lte: new Date() } },
    { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
  ],
};

async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
    }
  }
  console.error("[kalam:db-retry] استنفد الاستعلام محاولاته الثلاث", lastErr);
  throw lastErr;
}

/** أحدث المقالات المنشورة */
export async function getLatestArticles(limit = 9): Promise<ArticleWithSection[]> {
  return withDbRetry(() =>
    prisma.article.findMany({
      where: publishedWhere,
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    }),
  );
}

/** مقالات قسم معين */
export async function getArticlesBySection(
  sectionSlug: string,
  limit = 30,
): Promise<ArticleWithSection[]> {
  return withDbRetry(() =>
    prisma.article.findMany({
      where: { ...publishedWhere, section: { slug: sectionSlug } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    }),
  );
}

export function safeDecodeSlug(raw: string): string {
  if (!raw) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function getArticleBySlug(
  slug: string,
): Promise<ArticleWithSection | null> {
  if (!slug) return null;
  const decoded = safeDecodeSlug(slug);
  return withDbRetry(() =>
    prisma.article.findFirst({
      where: {
        AND: [
          { OR: [{ slug: decoded }, { slug }] },
          {
            OR: [
              { status: "PUBLISHED" },
              { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
            ],
          },
        ],
      },
      include: { section: true },
    }),
  );
}

export async function getPublishedSlugs(): Promise<{ slug: string }[]> {
  try {
    return await withDbRetry(() =>
      prisma.article.findMany({
        where: publishedWhere,
        select: { slug: true },
      }),
    );
  } catch {
    return [];
  }
}

export async function getActiveSections() {
  try {
    const sections = await withDbRetry(() =>
      prisma.section.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          _count: {
            select: {
              articles: {
                where: { status: "PUBLISHED" },
              },
            },
          },
        },
      }),
    );
    if (sections.length > 0) return sections;
  } catch {}
  return null;
}

export async function getRelatedArticles(
  articleId: string,
  sectionId: string | null,
  limit = 3,
): Promise<ArticleWithSection[]> {
  return withDbRetry(() =>
    prisma.article.findMany({
      where: {
        ...publishedWhere,
        id: { not: articleId },
        ...(sectionId ? { sectionId } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    }),
  );
}

export async function getApprovedComments(articleId: string) {
  return withDbRetry(() =>
    prisma.comment.findMany({
      where: { articleId, status: "APPROVED" },
      orderBy: [
        { isInspiring: "desc" },
        { selfPinnedAt: { sort: "desc", nulls: "last" } },
        { user: { isVerified: "desc" } },
        { createdAt: "desc" },
      ],
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            customName: true,
            customImage: true,
            avatarFrame: true,
            impactScore: true,
            intellectualRank: true,
            isVerified: true,
            verificationType: true,
            verificationLabel: true,
            verifiedAt: true,
            isVip: true,
            vipBadgeTitle: true,
            vipBadgeColor: true,
            vipPrivileges: true,
            extendedBio: true,
            verifiedSocialLinks: true,
          },
        },
      },
    }),
  );
}

export async function getCommentVoteStats(articleId: string) {
  const comments = await withDbRetry(() =>
    prisma.comment.findMany({
      where: { articleId, status: "APPROVED" },
      select: { id: true },
    }),
  );
  const ids = comments.map((c) => c.id);
  if (!ids.length) return {};
  const grouped = await withDbRetry(() =>
    prisma.commentVote.groupBy({
      by: ["commentId", "value"],
      where: { commentId: { in: ids } },
      _count: { value: true },
    }),
  );
  const stats: Record<string, { likes: number; dislikes: number }> = {};
  for (const g of grouped) {
    const row = (stats[g.commentId] ??= { likes: 0, dislikes: 0 });
    if (g.value === "LIKE") row.likes = g._count.value;
    else row.dislikes = g._count.value;
  }
  return stats;
}

export async function getInteractionCounts(articleId: string) {
  const grouped = await withDbRetry(() =>
    prisma.interaction.groupBy({
      by: ["value"],
      where: { articleId },
      _count: { value: true },
    }),
  );
  const likes = grouped.find((g) => g.value === 1)?._count.value ?? 0;
  const dislikes = grouped.find((g) => g.value === -1)?._count.value ?? 0;
  return { likes, dislikes };
}

export async function getMyVote(
  articleId: string,
  opts: { userId?: string | null; visitorFp?: string | null },
): Promise<number | null> {
  try {
    const where: Prisma.InteractionWhereInput = { articleId };
    if (opts.userId) where.userId = opts.userId;
    else if (opts.visitorFp) where.visitorFp = opts.visitorFp;
    else return null;
    const row = await withDbRetry(() =>
      prisma.interaction.findFirst({ where }),
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function getSectionSlugs(): Promise<string[]> {
  try {
    const sections = await withDbRetry(() =>
      prisma.section.findMany({
        where: { active: true },
        select: { slug: true },
      }),
    );
    return sections.map((s) => s.slug);
  } catch {
    return [];
  }
}
