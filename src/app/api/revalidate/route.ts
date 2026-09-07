import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * إعادة التحقق الفوري (On-Demand ISR)
 * تستدعيه لوحة التحكم لحظة النشر لتظهر المقالات فورًا دون انتظار 5 دقائق
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-revalidate-secret");
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { paths?: string[] };
    const paths = body.paths?.length ? body.paths : ["/"];

    for (const path of paths) {
      revalidatePath(path);
    }

    return NextResponse.json({ ok: true, revalidated: paths });
  } catch {
    return NextResponse.json({ error: "فشل إعادة التحقق" }, { status: 500 });
  }
}
