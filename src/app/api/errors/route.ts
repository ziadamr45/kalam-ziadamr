import { NextResponse } from "next/server";
import { logErrorReport, getClientIp } from "@/lib/audit";
import { createHash } from "crypto";

/**
 * استقبال الأخطاء اللحظية من المتصفحات — يعلم الأدمن بأي عطَل
 * يواجهه أي زائر فورًا مع تجميع الأخطاء المتطابقة.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      stack?: string;
      path?: string;
    };

    if (!body.message) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    /* بصمة الخطأ: رسالة + مسار — لتجميع التكرارات بدل إغراق القاعدة */
    const digest = createHash("sha256")
      .update(`${body.message.slice(0, 300)}|${body.path ?? ""}`)
      .digest("hex");

    await logErrorReport({
      message: body.message,
      stack: body.stack ?? null,
      path: body.path ?? null,
      userAgent: request.headers.get("user-agent"),
      digest,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
