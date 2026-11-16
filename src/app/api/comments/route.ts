import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeComment } from "@/lib/moderation";
import { aiModerate } from "@/lib/ai-moderation";
import { dispatchAdminEvent, dispatchNotification } from "@/lib/notifications/dispatcher";
import { awardImpact } from "@/lib/impact";
import { getSiteConfigFresh } from "@/lib/site-config";
import { requestIp, logSecurityEvent } from "@/lib/rate-limit";
import { recordServerError } from "@/lib/error-alert";
import { hasPrivilege } from "@/lib/vip";

/**
 * قراءة حية لمفتاح «اعتماد التعليقات تلقائيًا» من لوحة الأدمن —
 * المصدر الأول: SystemSetting «system_settings» (مفتاح لوحة التحكم المباشر)،
 * والمصدر الاحتياطي: مفتاح SiteConfig بنفس الاسم (توافق مع المواصفة).
 * قراءة طازة في كل طلب — التبديل من اللوحة يسري فورًا بلا كاش ولا نشر.
 */
async function readAutoApprove(): Promise<boolean> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "system_settings" } });
    const v = (row?.value ?? null) as { AUTO_APPROVE_COMMENTS?: boolean } | null;
    if (v && typeof v.AUTO_APPROVE_COMMENTS === "boolean") return v.AUTO_APPROVE_COMMENTS;
  } catch {}
  try {
    const cfg = await prisma.siteConfig.findFirst({ where: { key: "AUTO_APPROVE_COMMENTS" } });
    return (cfg?.value as boolean | undefined) === true;
  } catch {}
  return false;
}

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
  parentId: z.string().min(1).max(64).optional().nullable(),
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
    const { articleId, parentId, content, fp, honey, selfPin } = parsed.data;

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

    /* التحقق من حظر المستخدم + صلاحياته — يسبق مهلة التعليقات
       لأن المعفاون بنيويًا يُحدَّدون من هنا */
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, name: true, vipPrivileges: true, isVerified: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "تم إيقاف المشاركة لهذا الحساب" }, { status: 403 });
    }

    const rateKey = session.user.id;
    /* معفوّو مهلة التعليقات بنيويًا:
       1) الحسابات الموثقة رسميًا (علامة التوثيق تحمل إعفاءً ثابتًا)
       2) حاملو صلاحية bypassRateLimits/bypassCooldowns من العضوية المميزة
       — لكن الفلترة الأخلاقية ومراجعة التحرير تبقى على الجميع بلا استثناء */
    const cooldownExempt =
      user.isVerified ||
      hasPrivilege(user.vipPrivileges, "bypassRateLimits") ||
      hasPrivilege(user.vipPrivileges, "bypassCooldowns");
    if (!cooldownExempt && !allow(rateKey)) {
      return NextResponse.json(
        { error: "أرسلت عدة تعليقات خلال دقائق.. خذ نفسًا وعد لاحقًا" },
        { status: 429 },
      );
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
      select: { id: true, title: true, slug: true, commentsEnabled: true },
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

    let parentComment: { id: string; userId: string | null; articleId: string; status: string; parentId: string | null } | null = null;
    if (parentId) {
      parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, userId: true, articleId: true, status: true, parentId: true },
      });
      if (
        !parentComment ||
        parentComment.articleId !== articleId ||
        parentComment.status !== "APPROVED" ||
        parentComment.parentId !== null
      ) {
        return NextResponse.json({ error: "التعليق الأصلي غير متاح للرد" }, { status: 400 });
      }
    }

    /* التثبيت الذاتي — حصري لحاملي صلاحية selfPinComment، وتثبيت
       جديد يفك تثبيت تعليقهم السابق في المقال نفسه (واحد لكل كاتب) */
    const canSelfPin = !parentId && selfPin && hasPrivilege(user.vipPrivileges, "selfPinComment");
    if (canSelfPin) {
      await prisma.comment.updateMany({
        where: { articleId, userId: session.user.id, selfPinnedAt: { not: null } },
        data: { selfPinnedAt: null },
      });
    }

    const trimmed = content.trim();

    /* ============ «اعتماد التعليقات تلقائيًا» — المفتاح الحي من لوحة الأدمن ============
       الاعتماد الآمن فقط: تعليق نظيف من الفلترة الأخلاقية والرقابة AI وخطورة منخفضة.
       المُعلَّم بالفلترة أو ذو الخطورة المرتفعة يبقى PENDING للمراجعة البشرية مهما
       كان المفتاح — فالأتمتة لا تتجاوز الحارس أبدًا. */
    const autoApprove = await readAutoApprove();
    const autoApproved = autoApprove && !verdict.flagged && verdict.riskScore < 0.4;

    const created = await prisma.comment.create({
      data: {
        articleId,
        parentId: parentComment ? parentComment.id : null,
        userId: session.user.id,
        content: trimmed,
        status: autoApproved ? "APPROVED" : "PENDING",
        flagged: verdict.flagged,
        flagReasons: verdict.reasons,
        riskScore: verdict.riskScore,
        guestFp: fp || null,
        ...(canSelfPin ? { selfPinnedAt: new Date() } : {}),
      },
    });

    /* الاعتماد التلقائي يجعل التعليق حاضرًا لحظته — إعادة توليد فورية لصفحة المقال */
    if (autoApproved) {
      try {
        revalidatePath(`/article/${article.slug}`);
      } catch {}

      if (parentComment?.userId && parentComment.userId !== session.user.id) {
        void dispatchNotification({
          userId: parentComment.userId,
          type: "COMMENT_REPLY",
          title: "رد جديد على تعليقك",
          message: `${session.user.name ?? "قارئ"} ردّ على تعليقك في مقال «${article.title}»: ${trimmed.slice(0, 100)}${trimmed.length > 100 ? "…" : ""}`,
          link: `/article/${article.slug}#comments`,
          pushTag: `comment-reply-${parentComment.id}`,
        }).catch(() => {});
      }
    }

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

    /* حدث سيادة: تعليق جديد وارد — إن اعتُمد آليًا بدون اشتباه يُرصد في الجرس داخل
       المنصة فقط دون رنين لهاتف الأدمن، أما التعليق المشتبه به أو المعلق للمراجعة
       فيُبث فورًا لهاتف الإدارة. */
    void dispatchAdminEvent({
      type: "ADMIN_NEW_COMMENT",
      title: autoApproved
        ? `${parentComment ? "رد" : "تعليق"} منشور آليًا على مقال: ${(article.title || "بدون عنوان").slice(0, 80)}`
        : `${parentComment ? "رد" : "تعليق"} بانتظار المراجعة على مقال: ${(article.title || "بدون عنوان").slice(0, 80)}`,
      message: `${session.user.name ?? "قارئ"}: ${trimmed.slice(0, 110)}${
        trimmed.length > 110 ? "…" : ""
      }`,
      link: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/comments`,
      pushTag: "new-comment",
      skipDevicePush: autoApproved,
      metadata: { articleId, parentId: parentComment?.id ?? null, authorEmail: session.user.email ?? null, autoApproved },
    });

    return NextResponse.json({
      ok: true,
      autoApproved,
      message: autoApproved
        ? (parentComment ? "ردك منشور الآن" : "تعليقك منشور الآن — أُعتمد تلقائيًا لكلامٍ له لازمة")
        : (parentComment ? "ردك وصل وسيظهر بعد مراجعة فريق التحرير" : "تعليقك وصل وسيظهر بعد مراجعة فريق التحرير"),
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

const editSchema = z.object({
  id: z.string().min(1).max(64),
  content: z.string().min(1).max(1200),
});

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
    }
    const parsed = editSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات التعديل غير صالحة" }, { status: 400 });
    }
    const { id, content } = parsed.data;
    const trimmed = content.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "نص التعليق لا يمكن أن يكون فارغًا" }, { status: 400 });
    }

    const [user, comment] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { banned: true } }),
      prisma.comment.findUnique({
        where: { id },
        select: { id: true, userId: true, status: true, article: { select: { slug: true } } },
      }),
    ]);
    if (!user || user.banned) {
      return NextResponse.json({ error: "تم إيقاف المشاركة لهذا الحساب" }, { status: 403 });
    }
    if (!comment) {
      return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });
    }
    if (comment.userId !== session.user.id) {
      return NextResponse.json({ error: "لا تملك صلاحية تعديل هذا التعليق" }, { status: 403 });
    }

    const verdict = analyzeComment(trimmed);
    if (verdict.status === "REJECT") {
      return NextResponse.json({ error: verdict.reasons[0], rejected: true }, { status: 422 });
    }
    const ai = await aiModerate(trimmed);
    if (ai.checked && !ai.approved) {
      return NextResponse.json(
        { error: `${ai.reason} — راجع بنود صفحة «أخلاقيات الحوار والتعليق»`, rejected: true },
        { status: 422 },
      );
    }

    const autoApprove = await readAutoApprove();
    const keepApproved =
      comment.status === "APPROVED" &&
      (autoApprove || (!verdict.flagged && verdict.riskScore < 0.4));

    const now = new Date();
    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: {
        content: trimmed,
        status: keepApproved ? "APPROVED" : "PENDING",
        flagged: verdict.flagged,
        flagReasons: verdict.reasons,
        riskScore: verdict.riskScore,
        editedAt: now,
      },
      select: { id: true, content: true, status: true, editedAt: true },
    });

    if (comment.article?.slug) {
      try {
        revalidatePath(`/article/${comment.article.slug}`);
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      comment: {
        id: updated.id,
        content: updated.content,
        status: updated.status,
        editedAt: updated.editedAt?.toISOString() ?? now.toISOString(),
      },
    });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/comments",
      method: "PATCH",
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "تعذر تعديل التعليق" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id || id.length > 64) {
      return NextResponse.json({ error: "معرّف التعليق غير صالح" }, { status: 400 });
    }
    const comment = await prisma.comment.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, article: { select: { slug: true } } },
    });
    if (!comment) {
      return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });
    }
    if (comment.userId !== session.user.id) {
      return NextResponse.json({ error: "لا تملك صلاحية حذف هذا التعليق" }, { status: 403 });
    }
    await prisma.comment.delete({ where: { id: comment.id } });
    if (comment.status === "APPROVED" && comment.article?.slug) {
      try {
        revalidatePath(`/article/${comment.article.slug}`);
      } catch {}
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/comments",
      method: "DELETE",
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "تعذر حذف التعليق" }, { status: 500 });
  }
}
