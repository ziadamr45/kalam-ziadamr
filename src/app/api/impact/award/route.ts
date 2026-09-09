import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardImpact, requiredReadSeconds, AwardResult } from "@/lib/impact";
import { logEvent, getClientIp } from "@/lib/audit";

/**
 * ============================================================
 * منح نقاط «رصيد الأثر» — نقطة النهاية الوحيدة للمنح التلقائي
 * ============================================================
 * المحرك يعمل من جانب الخادم حصريًا: مزاعم القارئ (مدة البقاء،
 * نسبة التمرير، أدوار النقاش) تُفحص مقابل بيانات المقال الحقيقية
 * قبل قبول أي نقطة، ومنع التكرار موثوق بقيد فريد في قاعدة البيانات.
 *
 * الأفعال المقبولة من العميل: قراءة متأنية / نقاش عميق / مشاركة اقتباس
 * (التعليق الهادف والتمييز الإداري يُحتسبان داخليًا من مساراتهما)
 */

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "رصيد الأثر للمسجلين بحساب Google فقط" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await request.json()) as {
      actionType?: string;
      articleId?: string;
      dwellSeconds?: number;
      scrollPercent?: number;
      userTurns?: number;
    };

    const { actionType, articleId } = body;
    if (!actionType || !articleId) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    /* المستخدم المحظور لا يجمع رصيدًا */
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { banned: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "المشاركة موقوفة لهذا الحساب" }, { status: 403 });
    }

    /* المقال يجب أن يكون منشورًا فعلًا */
    const article = await prisma.article.findFirst({
      where: { id: articleId, status: "PUBLISHED" },
      select: { id: true, content: true, title: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير متاح" }, { status: 404 });
    }

    let result: AwardResult;

    /* ==================== القراءة المتأنية +1 (مرتان يوميًا كحد أقصى) ==================== */
    if (actionType === "READ_COMPLETE") {
      const required = requiredReadSeconds(article.content);
      const dwell = Math.max(0, Math.floor(Number(body.dwellSeconds) || 0));
      const scroll = Math.max(0, Math.min(100, Math.floor(Number(body.scrollPercent) || 0)));

      /* التحقق الصارم: بقاء متناسب مع طول المقال + تمرير 80% على الأقل */
      if (scroll < 80 || dwell < Math.round(required * 0.85)) {
        return NextResponse.json(
          {
            awarded: false,
            reason: "INVALID",
            message: "لم تستوفِ شروط القراءة المتأنية بعد — أكمل التمرير واقرأ على مهلك",
          },
          { status: 400 },
        );
      }

      result = await awardImpact({
        userId,
        actionType: "READ_COMPLETE",
        /* الوزن والسقف الحيان من التكوين السيادي */
        articleId,
        dedupKey: `READ:${userId}:${articleId}`,
      });
    } else if (actionType === "AI_DISCUSS") {
      /* ==================== النقاش الفكري العميق +1 ==================== */
      const turns = Math.max(0, Math.floor(Number(body.userTurns) || 0));
      if (turns < 3) {
        return NextResponse.json(
          { awarded: false, reason: "INVALID", message: "النقاش العميق يتطلب حوارًا مثمرًا لا سؤالًا عابرًا" },
          { status: 400 },
        );
      }
      result = await awardImpact({
        userId,
        actionType: "AI_DISCUSS",
        articleId,
        dedupKey: `AIDISC:${userId}:${articleId}`,
      });
    } else if (actionType === "QUOTE_SHARE") {
      /* ==================== حفظ ومشاركة الاقتباس +1 (مرتان يوميًا) ==================== */
      result = await awardImpact({
        userId,
        actionType: "QUOTE_SHARE",
        /* الوزن الحي من التكوين السيادي — الافتراضي +1 */
        articleId,
        dailyCap: 2,
      });
    } else {
      return NextResponse.json({ error: "نوع غير معروف" }, { status: 400 });
    }

    if (result.awarded) {
      logEvent({
        type: `IMPACT_${actionType}`,
        actorType: "USER",
        actorId: userId,
        actorLabel: session.user.email ?? null,
        message: `+${result.points} أثر — الرصيد ${result.impactScore}`,
        meta: { articleId, rank: result.rank, rankUp: result.rankUp },
        path: "/api/impact/award",
        ip: getClientIp(request),
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
