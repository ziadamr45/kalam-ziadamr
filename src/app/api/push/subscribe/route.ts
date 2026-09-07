import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * حفظ اشتراك المستخدم المسجل بجوجل في إشعارات الويب الفورية.
 * Upsert على endpoint — يدعم تجديد الاشتراك تلقائيًا وفتح المنصة من جهاز جديد
 * (كل جهاز له صف اشتراك مستقل مربوط بنفس الحساب).
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "سجّل الدخول بحساب Google لتفعيل الإشعارات" },
        { status: 401 },
      );
    }

    const banned = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true },
    });
    if (!banned || banned.banned) {
      return NextResponse.json({ error: "الحساب موقوف" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    } | null;

    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const authKey = body?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: "بيانات اشتراك غير مكتملة" }, { status: 400 });
    }

    const userAgent = (request.headers.get("user-agent") || "").slice(0, 400);

    await prisma.userPushSubscription.upsert({
      where: { endpoint },
      update: { userId: session.user.id, p256dh, auth: authKey, userAgent },
      create: { userId: session.user.id, endpoint, p256dh, auth: authKey, userAgent },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ الاشتراك" }, { status: 500 });
  }
}
