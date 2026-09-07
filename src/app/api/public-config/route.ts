import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/site-config";

/*
 * إعدادات عامة قابلة للنشر للعميل — نص التذييل فقط.
 * لا تُرجع أي مفاتيح أو إعدادات حساسة؛ إعدادات النشر تُدار من لوحة التحكم.
 */

export const dynamic = "force-dynamic";

const FALLBACK = "نُشر بعناية.. لكلام له لازمة.";

export async function GET() {
  try {
    const cfg = await getSiteConfig();
    return NextResponse.json(
      { FOOTER_TEXT: cfg.FOOTER_TEXT || FALLBACK },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ FOOTER_TEXT: FALLBACK });
  }
}
