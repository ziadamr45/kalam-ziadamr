import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logEvent } from "@/lib/audit";
import { awardImpact } from "@/lib/impact";
import { recordServerError } from "@/lib/error-alert";

/**
 * تصويت التعليقات — إعجاب أو عدم إعجاب.
 * القيود الصارمة:
 *  1. الزوار غير المسجلين ممنوعون منعًا باتًا (401) — التصويت للقارئين فقط.
 *  2. يُمنع التصويت على تعليقك الخاص (400).
 *  3. صوت واحد لكل قارئ لكل تعليق — الضغط مجددًا على الصوت نفسه يُلغيه،
 *     والضغط على الصوت المعاكس يبدّله (لا تصويت مكرر أبدًا).
 *  4. إشعار فوري لصاحب التعليق عند تفاعل جديد (تطبيقًا وفوريًا).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "سجّل الدخول أولًا لتفعيل التفاعل", code: "LOGIN_REQUIRED" },
        { status: 401 },
      );
    }

    const { commentId } = await params;
    const body = (await request.json().catch(() => ({}))) as { value?: string };
    const value = body.value;
    if (value !== "LIKE" && value !== "DISLIKE") {
      return NextResponse.json({ error: "قيمة التصويت غير صالحة" }, { status: 400 });
    }

    /* حالة القارئ — محظور لا يصوّت */
    const voter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, customName: true, name: true },
    });
    if (!voter || voter.banned) {
      return NextResponse.json({ error: "تم إيقاف التفاعل لهذا الحساب" }, { status: 403 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        articleId: true,
        status: true,
        article: { select: { slug: true, title: true } },
      },
    });
    if (!comment || comment.status !== "APPROVED") {
      return NextResponse.json({ error: "التعليق غير متاح للتفاعل" }, { status: 404 });
    }

    /* القيد الصارم: لا تصويت على تعليقك */
    if (comment.userId === session.user.id) {
      return NextResponse.json(
        { error: "لا يمكنك التصويت على تعليقك — تفاعل غير مسموح" },
        { status: 400 },
      );
    }

    const existing = await prisma.commentVote.findUnique({
      where: { userId_commentId: { userId: session.user.id, commentId } },
    });

    let myVote: "LIKE" | "DISLIKE" | null = value;
    let notifyOwner = false;

    if (existing && existing.value === value) {
      /* الضغط مجددًا على الصوت ذاته = إلغاء التصويت */
      await prisma.commentVote.delete({ where: { id: existing.id } });
      myVote = null;
    } else if (existing) {
      /* بدّل الصوت إلى المعاكس */
      await prisma.commentVote.update({ where: { id: existing.id }, data: { value } });
      notifyOwner = value === "LIKE"; // التحويل إلى إعجاب = أول إعجاب من هذا القارئ
    } else {
      await prisma.commentVote.create({
        data: { commentId, userId: session.user.id, value },
      });
      notifyOwner = value === "LIKE";
    }

    /* ============ «إعجاب قارئ مسجل» +1 نقطة لصاحب التعليق ============
       تُمنح مرة واحدة لكل قارئ لكل تعليق (قيد dedupKey فريد يحصّن
       إعادة الإعجاب بعد الإلغاء من التربح)، وبصمت داخل سجل الأثر. */
    if (value === "LIKE" && comment.userId) {
      void awardImpact({
        userId: comment.userId,
        actionType: "COMMENT_LIKED",
        /* الوزن الحي من التكوين السيادي — الافتراضي +1 */
        articleId: comment.articleId,
        dedupKey: `LIKE:${commentId}:${session.user.id}`,
        reason: "إعجاب قارئ مسجل بتعليقك",
      }).catch(() => {});
    }

    /* العدادات الحالية بعد التغيير */
    const grouped = await prisma.commentVote.groupBy({
      by: ["value"],
      where: { commentId },
      _count: { value: true },
    });
    const likes = grouped.find((g) => g.value === "LIKE")?._count.value ?? 0;
    const dislikes = grouped.find((g) => g.value === "DISLIKE")?._count.value ?? 0;

    /* إشعار صاحب التعليق — المرسل المركزي الموحد (تفاعل جديد فقط، لا إشعار عند الإلغاء) */
    if (notifyOwner && comment.userId) {
      const voterName = voter.customName?.trim() || voter.name || "قارئ";
      void dispatchNotification({
        userId: comment.userId,
        type: "COMMENT_LIKED",
        title: "تفاعل جديد مع تعليقك",
        message: `${voterName} أبدى إعجابه بتعليقك على مقال «${comment.article.title.slice(0, 60)}»`,
        link: `/article/${comment.article.slug}#comments`,
        pushTag: "comment-vote",
        metadata: { commentId, value, voterId: session.user.id },
        channels: "ALL",
      }).catch(() => {});
    }

    logEvent({
      type: "VOTE",
      actorType: "USER",
      actorId: session.user.id,
      actorLabel: voter.customName?.trim() || voter.name || null,
      message: `تصويت تعليق (${value}) — ${notifyOwner ? "تفاعل جديد" : "إلغاء"}`,
      meta: { commentId, value, articleSlug: comment.article.slug },
    }).catch(() => {});

    return NextResponse.json({ ok: true, myVote, likes, dislikes });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/comments/[commentId]/vote", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
