import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * سجل الأثر الكامل — مصدر شفافية الرصيد:
 * كل عملية منح/خصم موثقة بالحدث والتاريخ وعدد النقاط، بترقيم صفحات
 * (50 سجلًا لكل صفحة) لجولة التدقيق الكاملة في نافذة «سجل الأثر».
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") || "1")));
  const take = 50;

  const [logs, total, user] = await Promise.all([
    prisma.impactLog.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        actionType: true,
        points: true,
        reason: true,
        createdAt: true,
        article: { select: { slug: true, title: true } },
      },
    }),
    prisma.impactLog.count({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { impactScore: true, intellectualRank: true },
    }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    impactScore: user?.impactScore ?? 0,
    rank: user?.intellectualRank ?? "قارئ متأمل",
  });
}
