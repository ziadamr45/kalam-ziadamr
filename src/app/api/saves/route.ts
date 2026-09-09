import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * مكتبة القارئ المتزامنة — محفوظات الحساب عبر كل الأجهزة
 * GET    → قائمة محفوظاتي (بيانات المقال مختصرة)
 * POST   → حفظ مقال { articleId }
 * DELETE → إزالة حفظ { articleId }
 */

async function mySaves(userId: string) {
  const rows = await prisma.savedArticle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      article: {
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          readingTimeSec: true,
          coverImage: true,
          publishedAt: true,
          section: { select: { name: true, slug: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    savedAt: r.createdAt.toISOString(),
    id: r.article.id,
    slug: r.article.slug,
    title: r.article.title,
    summary: r.article.summary,
    readingTimeSec: r.article.readingTimeSec,
    coverImage: r.article.coverImage,
    publishedAt: r.article.publishedAt?.toISOString() ?? null,
    sectionName: r.article.section?.name ?? null,
    sectionSlug: r.article.section?.slug ?? null,
  }));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    return NextResponse.json({ saves: await mySaves(session.user.id) });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/saves", method: "GET", requestId: null, url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "سجّل الدخول بحساب Google لتتزامن محفوظاتك" },
      { status: 401 },
    );
  }
  try {
    const { articleId } = (await request.json()) as { articleId?: string };
    if (!articleId) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }
    await prisma.savedArticle.upsert({
      where: { userId_articleId: { userId: session.user.id, articleId } },
      create: { userId: session.user.id, articleId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/saves", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    const { articleId } = (await request.json()) as { articleId?: string };
    if (!articleId) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    await prisma.savedArticle.deleteMany({
      where: { userId: session.user.id, articleId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/saves", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
