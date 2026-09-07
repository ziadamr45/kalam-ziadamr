import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * تتبع التحليلات: زيارات، إكمال قراءة، مدة بقاء، مشاركات
 * لا يرمي أخطاء للعميل أبدًا (أدوات تحليل لا يجب أن تكسر التجربة)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: "view" | "complete" | "dwell" | "share";
      articleId?: string;
      slug?: string;
      path?: string;
      sessionId?: string;
      fp?: string;
      viewId?: string;
      readSeconds?: number;
      platform?: string;
      quoteLen?: number;
    };

    const { type } = body;
    if (!type || !body.sessionId) return NextResponse.json({ ok: false });

    if (type === "view") {
      let articleId = body.articleId ?? null;
      if (!articleId && body.slug) {
        const art = await prisma.article.findUnique({ where: { slug: body.slug }, select: { id: true } });
        articleId = art?.id ?? null;
      }
      const view = await prisma.pageView.create({
        data: {
          articleId,
          path: body.path ?? "/",
          sessionId: body.sessionId,
          visitorFp: body.fp ?? null,
        },
        select: { id: true },
      });
      /* عداد المشاهدات الفوري للمقال */
      if (articleId) {
        await prisma.article.update({
          where: { id: articleId },
          data: { views: { increment: 1 } },
        }).catch(() => {});
      }
      return NextResponse.json({ ok: true, viewId: view.id });
    }

    if (type === "complete" && body.viewId) {
      await prisma.pageView.update({
        where: { id: body.viewId },
        data: { completed: true, readSeconds: body.readSeconds ?? null },
      }).catch(() => {});
      if (body.articleId) {
        await prisma.article.update({
          where: { id: body.articleId },
          data: { completedReads: { increment: 1 } },
        }).catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "dwell" && body.viewId) {
      await prisma.pageView.update({
        where: { id: body.viewId },
        data: { readSeconds: body.readSeconds ?? null },
      }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (type === "share") {
      let articleId = body.articleId ?? null;
      if (!articleId && body.slug) {
        const art = await prisma.article.findUnique({ where: { slug: body.slug }, select: { id: true } });
        articleId = art?.id ?? null;
      }
      if (articleId) {
        await prisma.socialShare.create({
          data: {
            articleId,
            platform: body.platform ?? "other",
            quoteLen: body.quoteLen ?? null,
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false });
  } catch {
    /* التحليلات لا تُفشل تجربة المستخدم */
    return NextResponse.json({ ok: false });
  }
}
