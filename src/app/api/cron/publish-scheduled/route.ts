import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * مهمة Vercel Cron الأصلية — النشر المجدول التلقائي (المحور الثاني).
 *
 * Vercel يرسل تلقائيًا الترويسة Authorization: Bearer <CRON_SECRET>
 * مع كل استدعاء مجدول بمجرد وجود CRON_SECRET في متغيرات البيئة،
 * ويرفض المسار أي استدعاء عشوائي لا يحمل الرمز الصحيح.
 *
 * المنطق: تقلب المقالات المجدولة التي حان موعدها إلى منشورة فعليًا،
 * ثم إعادة تنشيط كاش الصفحات المعنية (On-demand ISR) لتظهر للقراء
 * لحظة حلول وقتها دون أي تأخير.
 *
 * آلية الأمان الاحتياطية (Fail-Safe): إلى جانب هذه المهمة، استعلامات
 * القراءة في المنصة (db-queries.ts) تسترجع تلقائيًا أي مقال مجدول
 * مرّ موعده — فلا يتأخر ظهور المقال حتى لو تأخرت المهمة المجدولة عارضًا.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret =
    authHeader?.replace(/^Bearer\s+/i, "") ||
    new URL(request.url).searchParams.get("secret");

  if (!process.env.CRON_SECRET || !secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const due = await prisma.article.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
      select: { id: true, slug: true, sectionId: true },
    });

    if (due.length === 0) {
      return NextResponse.json({ ok: true, published: 0, revalidated: [] });
    }

    /* شرائح الأقسام لروابط إعادة التحقق */
    const sectionIds = [...new Set(due.map((a) => a.sectionId).filter(Boolean))] as string[];
    const sections = sectionIds.length
      ? await prisma.section.findMany({
          where: { id: { in: sectionIds } },
          select: { id: true, slug: true },
        })
      : [];
    const sectionSlugById = new Map(sections.map((s) => [s.id, s.slug]));

    const paths = new Set<string>(["/"]);
    let published = 0;

    for (const article of due) {
      await prisma.article.update({
        where: { id: article.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      published += 1;
      paths.add(`/article/${article.slug}`);
      const sectionSlug = article.sectionId ? sectionSlugById.get(article.sectionId) : null;
      if (sectionSlug) paths.add(`/section/${sectionSlug}`);
    }

    /* إعادة تنشيط الكاش فورًا — المقال يظهر للجمهور لحظة استحقاقه */
    for (const path of paths) {
      try {
        revalidatePath(path);
      } catch {
        /* إعادة التحقق غير حرجة — ISR الدوري يغطي */
      }
    }

    return NextResponse.json({ ok: true, published, revalidated: [...paths] });
  } catch {
    return NextResponse.json({ error: "فشل تنفيذ المهمة" }, { status: 500 });
  }
}
