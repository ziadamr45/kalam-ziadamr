import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeComment } from "@/lib/moderation";
import { aiModerate } from "@/lib/ai-moderation";
import { pushAdmins } from "@/lib/push";
import { awardImpact } from "@/lib/impact";
import { getSiteConfigFresh } from "@/lib/site-config";
import { rateLimit, requestIp, logSecurityEvent } from "@/lib/rate-limit";
import { recordServerError } from "@/lib/error-alert";
import { hasPrivilege, userHasPrivilege } from "@/lib/vip";

const rateBuckets = new Map<string, number[]>();

function allow(key: string): boolean {
  const now = Date.now();
  const window = 10 * 60_000;
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < window);
  if (arr.length >= 5) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

const commentSchema = z.object({
  articleId: z.string().min(1).max(64),
  content: z.string().min(1).max(4000),
  fp: z.string().max(128).optional().default(""),
  /* فخ الروبوتات — حقل مخفي لا يراه الإنسان */
  honey: z.string().max(200).optional().default(""),
  /* التثبيت الذاتي — حصري لحاملي صلاحية selfPinComment */
  selfPin: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "سجّل الدخول بحساب Google للمشاركة في الحوار" },
        { status: 401 },
      );
    }

    const parsed = commentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const { articleId, content, fp, honey, selfPin } = parsed.data;

    /* فخ السبام — بوت يملأ الحقل المخفي: تجاهل صامت بلا أي معالجة */
    if (honey) {
      logSecurityEvent({
        type: "HONEYPOT",
        message: `فخ التعليقات التقط روبوتًا من ${requestIp(request)}`,
        meta: { ip: requestIp(request), path: "/api/comments" },
      });
      return NextResponse.json({ ok: true, message: "تعليقك وصل وسيظهر بعد مراجعة فريق التحرير" });
    }

    if (!articleId || !content?.trim()) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    /* مفتاح السيادة: قفل الحوار عامًا بإدارة المنصة — باب يُغلق فورًا من التكوين */
    const flags = await getSiteConfigFresh().catch(() => null);
    if (flags && !flags.COMMENTS_ENABLED) {
      return NextResponse.json(
        { error: "الحوار مغلق مؤقتًا بإدارة المنصة — عد قريبًا" },
        { status: 403 },
      );
    }

    const rateKey = session.user.id;
    /* حاملو صلاحية bypassRateLimits/bypassCooldowns معفون من مهلة التعليقات
       — لكن الفلترة الأخلاقية ومراجعة التحرير تبقى عليهم كالجميع */
    const vipBypass = await userHasPrivilege(session.user.id, "bypassRateLimits")
      .catch(() => false);
    if (!vipBypass && !allow(rateKey)) {
      return NextResponse.json(
        { error: "أرسلت عدة تعليقات خلال دقائق.. خذ نفسًا وعد لاحقًا" },
        { status: 429 },
      );
    }

    /* التحقق من حظر المستخدم + صلاحياته */
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, name: true, vipPrivileges: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "تم إيقاف المشاركة لهذا الحساب" }, { status: 403 });
    }

    /* الفلترة الأخلاقية متعددة المستويات (قواعد محلية لحظية) */
    const verdict = analyzeComment(content);

    if (verdict.status === "REJECT") {
      return NextResponse.json({ error: verdict.reasons[0], rejected: true }, { status: 422 });
    }

    /* الرقابة الأخلاقية الفورية بالذكاء الاصطناعي — نداء خفيف قبل الحفظ،
       ومعاييره الصارمة: الألفاظ النابية، التجريح الشخصي، الشريعة والقيم الإسلامية،
       العادات والتقاليد العربية والمصرية الأصيلة، وحجب السبام.
       عند أي عطل تُهمل النتيجة وتكمل الفلترة المحلية ومراجعة التحرير عملهما. */
    const ai = await aiModerate(content);
    if (ai.checked && !ai.approved) {
      return NextResponse.json(
        {
          error: `${ai.reason} — راجع بنود صفحة «أخلاقيات الحوار والتعليق»`,
          rejected: true,
        },
        { status: 422 },
      );
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, commentsEnabled: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }
    /* باب التعليق لكل مقال — يُطوى من التيرمينال السيادي دون نشر */
    if (article.commentsEnabled === false) {
      return NextResponse.json(
        { error: "التعليقات مغلقة على هذا المقال بإدارة المنصة" },
        { status: 403 },
      );
    }

    /* التثبيت الذاتي — حصري لحاملي صلاحية selfPinComment، وتثبيت
       جديد يفك تثبيت تعليقهم السابق في المقال نفسه (واحد لكل كاتب) */
    const canSelfPin = selfPin && hasPrivilege(user.vipPrivileges, "selfPinComment");
    if (canSelfPin) {
      await prisma.comment.updateMany({
        where: { articleId, userId: session.user.id, selfPinnedAt: { not: null } },
        data: { selfPinnedAt: null },
      });
    }

    const trimmed = content.trim();
    const created = await prisma.comment.create({
      data: {
        articleId,
        userId: session.user.id,
        content: trimmed,
        status: "PENDING",
        flagged: verdict.flagged,
        flagReasons: verdict.reasons,
        riskScore: verdict.riskScore,
        guestFp: fp || null,
        ...(canSelfPin ? { selfPinnedAt: new Date() } : {}),
      },
    });

    /* ============ «التعليق الهادف المعتمد» +2 نقطة أثر ============
       تُمنح للتعليق الذي اجتاز الفلترة الأخلاقية متعددة المستويات أعلاه
       واستوفى شروط الطول والمضمون (40 حرفًا فأكثر، بخطورة منخفضة)،
       بسقف يومي 3 تعليقات محتسبة حمايةً من تربية النقاط. */
    let impact: Awaited<ReturnType<typeof awardImpact>> | null = null;
    if (trimmed.length >= 40 && verdict.riskScore < 0.4) {
      try {
        impact = await awardImpact({
          userId: session.user.id,
          actionType: "COMMENT_APPROVED",
          /* الوزن الحي من التكوين السيادي — الافتراضي +2 */
          articleId,
          dedupKey: `COMMENT:${created.id}`,
          dailyCap: 3,
        });
      } catch {
        impact = null; // المنح زينة لا يعطل إرسال التعليق أبدًا
      }
    }

    /* إشعار ويب فوري لهاتف صاحب المنصة — تعليق جديد وارد يحتاج مراجعة */
    void pushAdmins({
      title: `تعليق جديد وارد على مقال: ${(article.title || "بدون عنوان").slice(0, 80)}`,
      body: `${session.user.name ?? "قارئ"}: ${trimmed.slice(0, 110)}${
        trimmed.length > 110 ? "…" : ""
      }`,
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/comments`,
      tag: "new-comment",
    });

    return NextResponse.json({
      ok: true,
      message: "تعليقك وصل وسيظهر بعد مراجعة فريق التحرير",
      impact: impact?.awarded
        ? { points: impact.points, impactScore: impact.impactScore, rank: impact.rank, rankUp: impact.rankUp }
        : null,
    });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/comments",
      method: "POST",
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
