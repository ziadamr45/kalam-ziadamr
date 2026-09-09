import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * محرك استئناف القراءة — حفظ موضع التمرير في قاعدة البيانات ليتزامن عبر
 * الأجهزة (يعمل بجانب نسخة localStorage المحلية الأسرع استجابة).
 *
 * POST { articleId, progress, scrollY } — تحديث/إنشاء موضع القراءة (يتطلب جلسة)
 * GET  ?articleId=…                — موضع القراءة المحفوظ لهذا المقال (يتطلب جلسة)
 */

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const body = (await request.json()) as {
      articleId?: string;
      progress?: number;
      scrollY?: number;
    };
    if (!body.articleId) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const progress = Math.max(0, Math.min(100, Math.round(body.progress ?? 0)));
    const scrollY = Math.max(0, Math.round(body.scrollY ?? 0));

    await prisma.readingProgress.upsert({
      where: { userId_articleId: { userId, articleId: body.articleId } },
      update: { progress, scrollY },
      create: { userId, articleId: body.articleId, progress, scrollY },
    });

    return NextResponse.json({ ok: true, progress, scrollY });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/progress", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const articleId = new URL(request.url).searchParams.get("articleId");
    if (!articleId) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const row = await prisma.readingProgress.findUnique({
      where: { userId_articleId: { userId, articleId } },
      select: { progress: true, scrollY: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, progress: row?.progress ?? 0, scrollY: row?.scrollY ?? 0 });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/progress", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
