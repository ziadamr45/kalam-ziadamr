import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * إعادة التحقق الفوري (On-Demand ISR)
 * تستدعيه لوحة التحكم لحظة النشر لتظهر المقالات فورًا دون انتظار 5 دقائق
 * + إبطال وسوم الكاش (site-config) لحظة تعديل التكوين السيادي
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-revalidate-secret");
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      paths?: string[];
      slug?: string;
      layout?: boolean;
      tag?: string;
    };

    /* إبطال وسم الكاش — تكوين المنصة السيادي أو غيره */
    if (body.tag) {
      revalidateTag(body.tag);
    }

    const paths = body.paths?.length ? body.paths : [];

    for (const path of paths) {
      /* layout: إعادة تحقق على مستوى التخطيط المشترك — تُحدّث القائمة
         الجانبية (الأقسام الحية) في كل الصفحات فورًا، تُستخدم عند
         إضافة/تعديل/حذف قسم من لوحة التحكم */
      revalidatePath(path, body.layout ? "layout" : undefined);
    }

    /* إعادة تحقق صريحة على مستوى صفحة المقال الديناميكي لحظة النشر */
    if (body.slug) {
      revalidatePath(`/article/${body.slug}`, "page");
    }

    return NextResponse.json({ ok: true, revalidated: paths });
  } catch {
    return NextResponse.json({ error: "فشل إعادة التحقق" }, { status: 500 });
  }
}
