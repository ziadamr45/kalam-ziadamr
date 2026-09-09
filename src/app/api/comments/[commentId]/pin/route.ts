import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { recordServerError } from "@/lib/error-alert";
import { userHasPrivilege } from "@/lib/vip";

/**
 * التثبيت الذاتي للتعليق — «تثبيت تعليقي أعلى النقاش»
 * حصري لحاملي صلاحية selfPinComment من منظومة الحسابات المميزة.
 * القيود الصارمة:
 *  1. لا التثبيت ولا الفك إلا على تعليق الكاتب نفسه — لا تثبيت لغيره أبدًا.
 *  2. تثبيت تعليق جديد في المقال نفسه يفك تثبيت تعليقه السابق تلقائيًا
 *     (واحد مثبّت لكل كاتب في كل مقال).
 *  3. التعليق المعتمد فقط يتأثر عمليًا في الترتيب — القائمة تعرض المثبت أعلى.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
    }

    const { commentId } = await params;
    const body = (await request.json().catch(() => ({}))) as { pin?: boolean };
    const pin = body.pin !== false; // الافتراضي: التثبيت

    /* الصلاحية تُفحص في الخادم حصريًا — لا ثقة بحالة العميل إطلاقًا */
    const allowed = await userHasPrivilege(session.user.id, "selfPinComment");
    if (!allowed) {
      return NextResponse.json(
        { error: "التثبيت الذاتي ميزة للحسابات المميزة" },
        { status: 403 },
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, articleId: true },
    });
    if (!comment) {
      return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });
    }
    if (comment.userId !== session.user.id) {
      return NextResponse.json({ error: "يمكنك تثبيت تعليقك أنت فقط" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      if (pin) {
        /* فك تثبيت تعليقه السابق في المقال نفسه ثم تثبيت المطلوب */
        await tx.comment.updateMany({
          where: { articleId: comment.articleId, userId: session.user.id, selfPinnedAt: { not: null } },
          data: { selfPinnedAt: null },
        });
        await tx.comment.update({ where: { id: comment.id }, data: { selfPinnedAt: new Date() } });
      } else {
        await tx.comment.update({
          where: { id: comment.id },
          data: { selfPinnedAt: null },
        });
      }
    });

    void logEvent({
      type: "COMMENT_SELF_PINNED",
      actorType: "USER",
      actorId: session.user.id,
      message: pin ? "تثبيت ذاتي لتعليق — صلاحية الحسابات المميزة" : "فك تثبيت ذاتي لتعليق",
      meta: { commentId: comment.id, articleId: comment.articleId, pin },
    }).catch(() => {});

    return NextResponse.json({ ok: true, pinned: pin });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/comments/[commentId]/pin",
      method: "POST",
    });
    return NextResponse.json({ error: "تعذر تنفيذ التثبيت" }, { status: 500 });
  }
}
