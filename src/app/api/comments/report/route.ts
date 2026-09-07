import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      commentId?: string;
      reason?: string;
      details?: string;
      fp?: string;
    };
    const { commentId, reason, details, fp } = body;

    if (!commentId || !reason?.trim()) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    if (!comment) {
      return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.commentReport.create({
        data: {
          commentId,
          reason: reason.trim(),
          details: details?.trim() || null,
          reporterFp: fp || null,
        },
      }),
      prisma.comment.update({
        where: { id: commentId },
        data: { reportCount: { increment: 1 } },
      }),
    ]);

    /* ثلاثة إبلاغات أو أكثر → رفع العلم للمراجعة الأولوية */
    const updated = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { reportCount: true },
    });
    if ((updated?.reportCount ?? 0) >= 3) {
      await prisma.comment.update({
        where: { id: commentId },
        data: { flagged: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
