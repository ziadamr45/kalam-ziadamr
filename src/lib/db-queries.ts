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

/**
 * فك ترميز الـ slug الوارد من المتصفح قبل أي استعلام.
 * الروابط العربية تصل من App Router مشفرة (URL Encoded) على هيئة
 * %D9%84%D9%85%D8%A7-... بينما المخزَّن في قاعدة البيانات عربي خالص،
 * فلا يكتمل البحث دون فك التشفير — وهو جذر صفحات 404 الزائفة.
 */
export function safeDecodeSlug(raw: string): string {
  if (!raw) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * مقال واحد بالـ slug — بمطابقة مزدوجة تحصينية:
 * (المشفر كما وصل + المفكوك كما خُزّن) فتُغطى كل حالات المتصفحات والروابط.
 * المنشور صراحةً بحالة PUBLISHED يُعرض بلا قيود زمنية إضافية،
 * والمجدول يُعرض لحظة استحقاق موعده فقط.
 */
export async function getArticleBySlug(
  slug: string,
): Promise<ArticleWithSection | null> {
  if (!slug) return null;
  const decoded = safeDecodeSlug(slug);
  try {
    const article = await prisma.article.findFirst({
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

/**
 * الأقسام النشطة من قاعدة البيانات — مصدر القائمة الجانبية الحي.
 * ترتيب حسب sortOrder ثم createdAt، مع عدّاد المقالات المنشورة لكل قسم
 * (شرط النشر الكسول نفسه حتى لا يُحسب المجدول المستقبلي).
 */
export async function getActiveSections() {
  try {
    const sections = await prisma.section.findMany({
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

/** التعليقات المعتمدة لمقال — بالهوية المعروضة والرتبة، مع خوارزمية أولوية
    «النقاشات الموثقة»: المُلهم مثبتًا أعلى، ثم تثبيت الكاتب الذاتي،
    ثم تعليقات الحسابات الموثقة لتظهر في مقدمة الحوار، ثم الأحدث */
export async function getApprovedComments(articleId: string) {
  try {
    return await prisma.comment.findMany({
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
            impactScore: true,
            intellectualRank: true,
            /* منظومة التوثيق السيادي: الشارة واللون وإطار التعليق الفخم */
            isVerified: true,
            vipBadgeTitle: true,
            vipBadgeColor: true,
            vipPrivileges: true,
          },
        },
      },
    });
  } catch {
    return [];
  }
}

/** إحصاءات إعجاب/عدم إعجاب تعليقات مقال — خريطة commentId → { likes, dislikes } */
export async function getCommentVoteStats(articleId: string) {
  try {
    const comments = await prisma.comment.findMany({
      where: { articleId, status: "APPROVED" },
      select: { id: true },
    });
    const ids = comments.map((c) => c.id);
    if (!ids.length) return {};
    const grouped = await prisma.commentVote.groupBy({
      by: ["commentId", "value"],
      where: { commentId: { in: ids } },
      _count: { value: true },
    });
    const stats: Record<string, { likes: number; dislikes: number }> = {};
    for (const g of grouped) {
      const row = (stats[g.commentId] ??= { likes: 0, dislikes: 0 });
      if (g.value === "LIKE") row.likes = g._count.value;
      else row.dislikes = g._count.value;
    }
    return stats;
  } catch {
    return {};
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
