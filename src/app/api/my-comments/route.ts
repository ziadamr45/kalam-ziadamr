import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** تعليقاتي — لصفحة حسابي */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    const comments = await prisma.comment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        status: true,
        flagged: true,
        createdAt: true,
        article: { select: { slug: true, title: true } },
      },
    });
    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        status: c.status,
        flagged: c.flagged,
        createdAt: c.createdAt.toISOString(),
        articleSlug: c.article?.slug ?? null,
        articleTitle: c.article?.title ?? "مقال محذوف",
      })),
    });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
