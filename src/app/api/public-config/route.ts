import { NextResponse } from "next/server";
import { getPublicBundle } from "@/lib/site-config";

/**
 * حزمة التكوين القابلة للنشر للعميل — كل ما تحتاجه الواجهات التفاعلية
 * من نصوص الهوية ومفاتيح الميزات، بلا أسرار ولا إعدادات حساسة.
 * تُدار قيمها كاملة من استوديو التكوين السيادي بلوحة الأدمن.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bundle = await getPublicBundle();
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "تعذر جلب التكوين" }, { status: 500 });
  }
}
