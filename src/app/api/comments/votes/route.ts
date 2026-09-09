import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * أصواتي على تعليقات مقال — تُقرأ من العميل بعد الرسم الأولي
 * ليعرف المستخدم أي التعليقات صوّت لها (تلوين الأيقونة).
 * الزائر غير المسجل يحصل على خريطة فارغة بصمت.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ myVotes: {} });

    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId");
    if (!articleId) return NextResponse.json({ myVotes: {} });

    const votes = await prisma.commentVote.findMany({
      where: {
        userId: session.user.id,
        comment: { articleId, status: "APPROVED" },
      },
      select: { commentId: true, value: true },
    });

    const myVotes: Record<string, "LIKE" | "DISLIKE"> = {};
    for (const v of votes) myVotes[v.commentId] = v.value;
    return NextResponse.json({ myVotes });
  } catch {
    return NextResponse.json({ myVotes: {} });
  }
}
