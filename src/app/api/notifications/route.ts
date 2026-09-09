import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * جرس إشعارات المستخدم — قائمة الإشعارات الداخلية + عداد غير المقروء.
 * GET: آخر 30 إشعارًا | POST: تعليم إشعارًا أو الكل كمقروء.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const userId = session.user.id;

    const [items, unread] = await Promise.all([
      prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);

    return NextResponse.json({ items, unread });
  } catch {
    return NextResponse.json({ items: [], unread: 0 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { all?: boolean; id?: string };
    const userId = session.user.id;

    if (body.all) {
      await prisma.userNotification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    } else if (body.id) {
      await prisma.userNotification.updateMany({
        where: { userId, id: body.id },
        data: { readAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/notifications", method: "GET", requestId: null, url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
