import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * واجهة الإشعارات الموحدة — تقرأ من الجدول المركزي Notification
 * (المنفذ عبر المرسل المركزي lib/notifications/dispatcher.ts):
 *  GET  — آخر 30 إشعارًا + عدد غير المقروء
 *  POST — تعليم الكل أو إشعار بعينه كمقروء
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const userId = session.user.id;

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
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
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
    } else if (body.id) {
      await prisma.notification.updateMany({
        where: { userId, id: body.id },
        data: { isRead: true, readAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/notifications",
      method: "POST",
      requestId: request.headers.get("x-kalam-rid"),
    });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
