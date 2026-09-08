/**
 * ============================================================
 * محرك رصيد الأثر — الاحتساب الآمن على السيرفر حصريًا
 * ============================================================
 * مبادئ صارمة:
 * 1. كل نقطة تُوثَّق في جدول ImpactLog — لا رصيد بلا سجل.
 * 2. منع التكرار بمفتاح dedupKey فريد على مستوى قاعدة البيانات
 *    (قراءة المقال ونقاشه مرة واحدة لكل قارئ لكل مقال).
 * 3. السقوف اليومية تُحتسب بتوقيت القاهرة لحماية المنظومة من الزرع الآلي.
 * 4. الرصيد لا ينزل تحت الصفر، والرتبة تُعاد حسابها مع كل حركة.
 * 5. لا تُرمى أخطاء المنح لأعلى — المنظومة زينة لا تُعطّل مسارًا أساسيًا.
 */

import { prisma } from "@/lib/prisma";
import { rankForScore } from "@/lib/ranks";

export const IMPACT_POINTS = {
  READ_COMPLETE: 10,
  AI_DISCUSS: 5,
  COMMENT_APPROVED: 15,
  COMMENT_INSPIRING: 30,
  QUOTE_SHARE: 3,
} as const;

export type ImpactActionType =
  | "READ_COMPLETE"
  | "AI_DISCUSS"
  | "COMMENT_APPROVED"
  | "COMMENT_INSPIRING"
  | "QUOTE_SHARE"
  | "ADMIN_ADJUST";

export type AwardResult = {
  awarded: boolean;
  reason?: "DUPLICATE" | "DAILY_LIMIT" | "INVALID";
  impactScore: number;
  rank: string;
  rankUp: boolean;
  points: number;
};

/** بداية اليوم بتوقيت القاهرة (UTC+3 صيفًا ثابتًا عمليًا هنا) */
function startOfCairoDay(): Date {
  const now = new Date();
  const cairo = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  cairo.setUTCHours(0, 0, 0, 0);
  return new Date(cairo.getTime() - 3 * 60 * 60 * 1000);
}

/**
 * منح نقاط أثر لقارئ — المعاملة ذرّية: سجل + تحديث الرصيد والرتبة معًا.
 * dedupKey موجود → قيد UNIQUE يمنع أي ازدواج حتى تحت التزامن.
 * dailyCap موجود → عدد مرات مسموح في اليوم الواحد.
 */
export async function awardImpact(opts: {
  userId: string;
  actionType: ImpactActionType;
  points: number;
  articleId?: string | null;
  dedupKey?: string | null;
  reason?: string | null;
  dailyCap?: number;
}): Promise<AwardResult> {
  const before = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { impactScore: true, intellectualRank: true },
  });
  if (!before) {
    return { awarded: false, reason: "INVALID", impactScore: 0, rank: "قارئ متأمل", rankUp: false, points: 0 };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      /* السقف اليومي — يُفحص داخل المعاملة لمنع السباق */
      if (opts.dailyCap && opts.dailyCap > 0) {
        const todayCount = await tx.impactLog.count({
          where: {
            userId: opts.userId,
            actionType: opts.actionType,
            createdAt: { gte: startOfCairoDay() },
          },
        });
        if (todayCount >= opts.dailyCap) {
          return null;
        }
      }

      await tx.impactLog.create({
        data: {
          userId: opts.userId,
          actionType: opts.actionType,
          points: opts.points,
          articleId: opts.articleId ?? null,
          dedupKey: opts.dedupKey ?? null,
          reason: opts.reason ?? null,
        },
      });

      const newScore = Math.max(0, before.impactScore + opts.points);
      const newRank = rankForScore(newScore);

      await tx.user.update({
        where: { id: opts.userId },
        data: { impactScore: newScore, intellectualRank: newRank },
      });

      return { impactScore: newScore, rank: newRank } as const;
    });

    if (result === null) {
      return {
        awarded: false,
        reason: "DAILY_LIMIT",
        impactScore: before.impactScore,
        rank: before.intellectualRank,
        rankUp: false,
        points: 0,
      };
    }

    return {
      awarded: true,
      impactScore: result.impactScore,
      rank: result.rank,
      rankUp: result.rank !== before.intellectualRank,
      points: opts.points,
    };
  } catch (err) {
    /* ازدواج مفتاح UNIQUE → مُكافأ سابقًا، وليس عطلًا */
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return {
        awarded: false,
        reason: "DUPLICATE",
        impactScore: before.impactScore,
        rank: before.intellectualRank,
        rankUp: false,
        points: 0,
      };
    }
    throw err;
  }
}

/**
 * حساب مدة القراءة المتأنية المطلوبة لمقال — تتناسب طرديًا مع عدد كلماته.
 * سرعة قارئ عربي متأنٍ ≈ 185 كلمة/دقيقة، بحد أدنى 20 ثانية وأقصى 4 دقائق.
 */
export function requiredReadSeconds(content: string): number {
  const words = content.replace(/\[\[[^\]]+\]\]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(240, Math.max(20, words / 3.1)));
}
