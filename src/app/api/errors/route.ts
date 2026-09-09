import { NextResponse } from "next/server";
import { z } from "zod";
import { logErrorReport } from "@/lib/audit";
import { pushAdmins } from "@/lib/push";
import { rateLimit, rateLimitDurable, requestIp, logSecurityEvent } from "@/lib/rate-limit";
import { recordServerError } from "@/lib/error-alert";
import { createHash } from "crypto";

/* خنق إشعارات الأخطاء: كل خطأ متميز يُبث مرة واحدة كل 10 دقائق كحد أقصى */
const recentPushAt = new Map<string, number>();
const PUSH_THROTTLE_MS = 10 * 60_000;

const errorSchema = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(4000).optional().default(""),
  path: z.string().max(300).optional().default(""),
});

/**
 * استقبال الأخطاء اللحظية من المتصفحات — يعلم الأدمن بأي عطَل
 * يواجهه أي زائر فورًا مع تجميع الأخطاء المتطابقة.
 * دروع الحافة: حد معدل 10/5د لكل IP — كان مكشوفًا تمامًا سابقًا.
 */
export async function POST(request: Request) {
  const ip = requestIp(request);
  try {
    /* سد سطح الإغراق: درع مزدوج — ذاكرة النسخة + العداد الدائم عبر RequestLog */
    const mem = rateLimit(`errreport:${ip}`, 10, 5 * 60_000);
    const durable = await rateLimitDurable({ path: "/api/errors", ip, limit: 10, windowMs: 5 * 60_000 });
    if (!mem.ok || !durable.ok) {
      logSecurityEvent({
        type: "RATE_LIMIT",
        message: `إغراق محتمل على /api/errors من ${ip}`,
        meta: { ip, path: "/api/errors" },
      });
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const parsed = errorSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const body = parsed.data;

    /* بصمة الخطأ: رسالة + مسار — لتجميع التكرارات بدل إغراق القاعدة */
    const digest = createHash("sha256")
      .update(`${body.message.slice(0, 300)}|${body.path ?? ""}`)
      .digest("hex");

    await logErrorReport({
      message: body.message,
      stack: body.stack || null,
      path: body.path || null,
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
        body: `${body.message.slice(0, 110)}${body.message.length > 110 ? "…" : ""} — المسار: ${body.path || "غير معروف"}`,
        url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/audit`,
        tag: `error-${digest.slice(0, 8)}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/errors",
      method: "POST",
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
