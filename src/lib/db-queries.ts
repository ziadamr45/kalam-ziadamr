import type {
  Article,
  Comment,
  Prisma,
  Section,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ArticleWithSection = Article & { section: Section | null };

/**
 * شرط "متاح للنشر الآن" — النشر الكسول بلا Cron:
 * المنشور فعلًا + المجدول الذي حان موعده (يظهر تلقائيًا لحظة استحقاقه).
 */
const publishedWhere: Prisma.ArticleWhereInput = {
  OR: [
    { status: "PUBLISHED", publishedAt: { lte: new Date() } },
    { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
  ],
};

/** أحدث المقالات المنشورة */
export async function getLatestArticles(limit = 9): Promise<ArticleWithSection[]> {
  try {
    return await prisma.article.findMany({
      where: publishedWhere,
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    });
  } catch {
    return [];
  }
}

/** مقالات قسم معين */
export async function getArticlesBySection(
  sectionSlug: string,
  limit = 30,
): Promise<ArticleWithSection[]> {
  try {
    return await prisma.article.findMany({
      where: { ...publishedWhere, section: { slug: sectionSlug } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    });
  } catch {
    return [];
  }
}

/** مقال واحد بالـ slug */
export async function getArticleBySlug(
  slug: string,
): Promise<ArticleWithSection | null> {
  try {
    const article = await prisma.article.findFirst({
      where: { slug, ...publishedWhere },
      include: { section: true },
    });
    return article;
  } catch {
    return null;
  }
}

/** جميع الـ slugs المنشورة (لـ generateStaticParams) */
export async function getPublishedSlugs(): Promise<{ slug: string }[]> {
  try {
    return await prisma.article.findMany({
      where: publishedWhere,
      select: { slug: true },
    });
  } catch {
    return [];
  }
}

/** الأقسام النشطة من قاعدة البيانات مع fallback للثوابت */
export async function getActiveSections() {
  try {
    const sections = await prisma.section.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    if (sections.length > 0) return sections;
  } catch {}
  return null;
}

/** مقالات ذات صلة من نفس القسم */
export async function getRelatedArticles(
  articleId: string,
  sectionId: string | null,
  limit = 3,
): Promise<ArticleWithSection[]> {
  try {
    return await prisma.article.findMany({
      where: {
        ...publishedWhere,
        id: { not: articleId },
        ...(sectionId ? { sectionId } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { section: true },
    });
  } catch {
    return [];
  }
}

/** التعليقات المعتمدة لمقال — بالهوية المعروضة والرتبة، و«التعليق الملهم» مثبتًا أعلى القائمة */
export async function getApprovedComments(articleId: string) {
  try {
    return await prisma.comment.findMany({
      where: { articleId, status: "APPROVED" },
      orderBy: [{ isInspiring: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        user: {
          select: {
            name: true,
            image: true,
            customName: true,
            customImage: true,
            impactScore: true,
            intellectualRank: true,
          },
        },
      },
    });
  } catch {
    return [];
  }
}

/** عدادات التفاعل الحالية */
export async function getInteractionCounts(articleId: string) {
  try {
    const grouped = await prisma.interaction.groupBy({
      by: ["value"],
      where: { articleId },
      _count: { value: true },
    });
    const likes = grouped.find((g) => g.value === 1)?._count.value ?? 0;
    const dislikes = grouped.find((g) => g.value === -1)?._count.value ?? 0;
    return { likes, dislikes };
  } catch {
    return { likes: 0, dislikes: 0 };
  }
}

/** تصويت الزائر الحالي إن وُجد */
export async function getMyVote(
  articleId: string,
  opts: { userId?: string | null; visitorFp?: string | null },
): Promise<number | null> {
  try {
    const where: Prisma.InteractionWhereInput = { articleId };
    if (opts.userId) where.userId = opts.userId;
    else if (opts.visitorFp) where.visitorFp = opts.visitorFp;
    else return null;
    const row = await prisma.interaction.findFirst({ where });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** slugs الأقسام لخريطة الموقع */
export async function getSectionSlugs(): Promise<string[]> {
  try {
    const sections = await prisma.section.findMany({
      where: { active: true },
      select: { slug: true },
    });
    return sections.map((s) => s.slug);
  } catch {
    return [];
  }
}
