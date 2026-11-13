import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * مسار «متابعة القراءة» — الوجهة الذكية لاختصار الضغط المطول على أيقونة
 * التطبيق. أندرويد يحدّث بيان الـmanifest كل بضعة أيام في الخلفية، لذا
 * الاختصار يشير إلى هذا المسار الثابت (لا إلى مقال مباشر) كي يفتح دومًا
 * أحدث موضع قراءة للقارئ لحظة الضغط: أحدث مقال لم يُكمل قراءته، وإلا
 * أحدث مقال تفاعل معه، والزوار يذهبون إلى أحدث المقالات.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      const rows = await prisma.readingProgress.findMany({
        where: { userId, article: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { progress: true, article: { select: { slug: true } } },
      });
      /* أحدث موضع غير مكتمل أولًا — وإلا أحدث موضع محفوظ (إعادة زيارة) */
      const target = rows.find((r) => r.progress < 95) ?? rows[0];
      if (target) {
        return NextResponse.redirect(
          new URL(`/article/${encodeURIComponent(target.article.slug)}`, request.url),
          302,
        );
      }
    }
  } catch {
    /* أي عطل — تجربة الضغط المطول لا تُكسر أبدًا */
  }
  return NextResponse.redirect(new URL("/#latest-articles", request.url), 302);
}
