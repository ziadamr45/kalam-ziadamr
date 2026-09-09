import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * إلغاء اشتراك إشعارات الويب — يُحذف الصف المطابق للـ endpoint من أي جدول.
 * متاح دون جلسة لأن المتصفح قد يلغي الاشتراك بعد انتهاء الجلسة،
 * ولا يشكّل خطرًا: حذف اشتراك لا يكشف أي بيانات.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    const endpoint = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint مطلوب" }, { status: 400 });
    }

    await prisma.userPushSubscription
      .delete({ where: { endpoint } })
      .catch(() => null);
    await prisma.adminPushSubscription
      .delete({ where: { endpoint } })
      .catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/push/unsubscribe", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "تعذر إلغاء الاشتراك" }, { status: 500 });
  }
}
