import { NextResponse } from "next/server";
import { logErrorReport, getClientIp } from "@/lib/audit";
import { pushAdmins } from "@/lib/push";
import { createHash } from "crypto";

/* خنق إشعارات الأخطاء: كل خطأ متميز يُبث مرة واحدة كل 10 دقائق كحد أقصى */
const recentPushAt = new Map<string, number>();
const PUSH_THROTTLE_MS = 10 * 60_000;

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

    /* إشعار فوري لصاحب المنصة — خطأ بالسيرفر يواجه أحد الزوار (مخنوق بالبصمة) */
    const now = Date.now();
    if ((recentPushAt.get(digest) ?? 0) < now - PUSH_THROTTLE_MS) {
      recentPushAt.set(digest, now);
      if (recentPushAt.size > 1000) recentPushAt.clear();
      void pushAdmins({
        title: "تنبيه أمني: رصد خطأ بالسيرفر يواجه أحد الزوار",
        body: `${body.message.slice(0, 110)}${body.message.length > 110 ? "…" : ""} — المسار: ${body.path ?? "غير معروف"}`,
        url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/audit`,
        tag: `error-${digest.slice(0, 8)}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
