import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* حد معدل بسيط في الذاكرة: 20 تصويتًا/دقيقة لكل زائر */
const rateBuckets = new Map<string, number[]>();

function allow(fp: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const arr = (rateBuckets.get(fp) ?? []).filter((t) => now - t < window);
  if (arr.length >= 20) {
    rateBuckets.set(fp, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(fp, arr);
  return true;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      articleId?: string;
      value?: number;
      fp?: string;
    };

    const { articleId, value, fp } = body;
    if (!articleId || (value !== 1 && value !== -1)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id || null;

    if (!userId && !fp) {
      return NextResponse.json({ error: "هوية الزائر مطلوبة" }, { status: 400 });
    }

    if (!allow(userId || fp || "anon")) {
      return NextResponse.json({ error: "طلبات كثيرة جدًا، مهّل قليلًا" }, { status: 429 });
    }

    /* تفرد التصويت: حسب المستخدم أو بصمة الزائر */
    const where = userId
      ? { articleId_userId: { articleId, userId } }
      : { articleId_visitorFp: { articleId, visitorFp: fp as string } };

    const existing = await prisma.interaction.findUnique({ where });

    let myVote: number | null;

    if (existing && existing.value === value) {
      /* نقرة ثانية على نفس التصويت = إلغاء */
      await prisma.interaction.delete({ where: { id: existing.id } });
      myVote = null;
    } else if (existing) {
      await prisma.interaction.update({ where: { id: existing.id }, data: { value } });
      myVote = value;
    } else {
      await prisma.interaction.create({
        data: {
          articleId,
          value,
          userId,
          visitorFp: userId ? null : fp,
        },
      });
      myVote = value;
    }

    const grouped = await prisma.interaction.groupBy({
      by: ["value"],
      where: { articleId },
      _count: { value: true },
    });

    const likes = grouped.find((g) => g.value === 1)?._count.value ?? 0;
    const dislikes = grouped.find((g) => g.value === -1)?._count.value ?? 0;

    return NextResponse.json({ likes, dislikes, myVote });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
