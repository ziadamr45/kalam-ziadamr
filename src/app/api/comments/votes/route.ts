import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * أصوات وأعداد تفاعلات تعليقات مقال — تُقرأ حيةً من القاعدة بعد الرسم الأولي
 * لتحديث العدادات فورًا فوق نسخة ISR الثابتة، مع إرجاع اختيارات القارئ إن كان مسجلًا.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId");
    if (!articleId) return NextResponse.json({ myVotes: {}, counts: {} });

    const session = await auth();
    const userId = session?.user?.id ?? null;

    const [grouped, myVoteRows] = await Promise.all([
      prisma.commentVote.groupBy({
        by: ["commentId", "value"],
        where: { comment: { articleId, status: "APPROVED" } },
        _count: { value: true },
      }),
      userId
        ? prisma.commentVote.findMany({
            where: {
              userId,
              comment: { articleId, status: "APPROVED" },
            },
            select: { commentId: true, value: true },
          })
        : Promise.resolve([]),
    ]);

    const counts: Record<string, { likes: number; dislikes: number }> = {};
    for (const g of grouped) {
      if (!counts[g.commentId]) counts[g.commentId] = { likes: 0, dislikes: 0 };
      if (g.value === "LIKE") counts[g.commentId].likes = g._count.value;
      else if (g.value === "DISLIKE") counts[g.commentId].dislikes = g._count.value;
    }

    const myVotes: Record<string, "LIKE" | "DISLIKE"> = {};
    for (const v of myVoteRows) myVotes[v.commentId] = v.value;

    return NextResponse.json({ myVotes, counts });
  } catch {
    return NextResponse.json({ myVotes: {}, counts: {} });
  }
}
