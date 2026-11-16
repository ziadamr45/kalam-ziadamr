import type {
  Article,
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

/** مقالات ذات صلة: من نفس القسم أولًا، ثم تكمل من بقية المنصة حتى يظهر القسم دائمًا */
export async function getRelatedArticles(
  articleId: string,
  sectionId: string | null,
  limit = 3,
): Promise<ArticleWithSection[]> {
  const sameSection = await withDbRetry(() =>
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

  if (sameSection.length >= limit || !sectionId) {
    return sameSection;
  }

  const excludeIds = [articleId, ...sameSection.map((a) => a.id)];
  const fallback = await withDbRetry(() =>
    prisma.article.findMany({
      where: {
        ...publishedWhere,
        id: { notIn: excludeIds },
      },
      orderBy: { publishedAt: "desc" },
      take: limit - sameSection.length,
      include: { section: true },
    }),
  );

  return [...sameSection, ...fallback];
}

/** مختارات مخصصة لحساب القارئ: بحسب أقسام محفوظاته وتفاعلاته وتقدمه، أو الأكثر قراءة */
export async function getPersonalizedArticles(
  userId: string,
  limit = 3,
): Promise<ArticleWithSection[]> {
  try {
    const [saved, interactions, progresses] = await Promise.all([
      prisma.savedArticle.findMany({
        where: { userId },
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { article: { select: { sectionId: true } } },
      }),
      prisma.interaction.findMany({
        where: { userId, value: 1 },
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: { article: { select: { sectionId: true } } },
      }),
      prisma.readingProgress.findMany({
        where: { userId },
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: { articleId: true, progress: true, article: { select: { sectionId: true } } },
      }),
    ]);

    const completedIds = progresses.filter((p) => p.progress >= 90).map((p) => p.articleId);
    const preferredSectionIds = Array.from(
      new Set(
        [
          ...saved.map((s) => s.article.sectionId),
          ...interactions.map((i) => i.article.sectionId),
          ...progresses.map((p) => p.article.sectionId),
        ].filter((id): id is string => Boolean(id)),
      ),
    );

    if (preferredSectionIds.length > 0) {
      const matched = await prisma.article.findMany({
        where: {
          ...publishedWhere,
          sectionId: { in: preferredSectionIds },
          ...(completedIds.length > 0 ? { id: { notIn: completedIds } } : {}),
        },
        orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
        take: limit,
        include: { section: true },
      });
      if (matched.length > 0) return matched;
    }

    return await prisma.article.findMany({
      where: {
        ...publishedWhere,
        ...(completedIds.length > 0 ? { id: { notIn: completedIds } } : {}),
      },
      orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
      take: limit,
      include: { section: true },
    });
  } catch {
    return [];
  }
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
