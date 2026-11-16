import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";
import type { NotificationType } from "@prisma/client";

const ADMIN_NOTIFICATION_TYPES: NotificationType[] = [
  "ADMIN_NEW_USER",
  "ADMIN_NEW_COMMENT",
  "ADMIN_NEW_PROPOSAL",
  "ADMIN_COMMENT_REPORTED",
  "ADMIN_SYSTEM_ALERT",
];

/**
 * واجهة الإشعارات الموحدة — تقرأ من الجدول المركزي Notification
 * (المنفذ عبر المرسل المركزي lib/notifications/dispatcher.ts):
 *  GET  — آخر 30 إشعارًا خاصًا بالقارئ (تُستبعد إشعارات الإدارة والمخفية) + عدد غير المقروء
 *  POST — تعليم الكل أو إشعار بعينه كمقروء، أو إخفاء نهائي { id, action: "dismiss" }
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const userId = session.user.id;
    const readerWhere = {
      userId,
      dismissedAt: null,
      type: { notIn: ADMIN_NOTIFICATION_TYPES },
    };

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: readerWhere,
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
          metadata: true,
        },
      }),
      prisma.notification.count({ where: { ...readerWhere, isRead: false } }),
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

    const body = (await request.json().catch(() => ({}))) as {
      all?: boolean;
      id?: string;
      action?: "read" | "dismiss";
    };
    const userId = session.user.id;

    if (body.all) {
      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
          dismissedAt: null,
          type: { notIn: ADMIN_NOTIFICATION_TYPES },
        },
        data: { isRead: true, readAt: new Date() },
      });
    } else if (body.id && body.action === "dismiss") {
      /* الإخفاء النهائي — يخرج من القائمة والعداد مع بقاء التوثيق في قاعدة البيانات */
      await prisma.notification.updateMany({
        where: { userId, id: body.id },
        data: { dismissedAt: new Date(), isRead: true, readAt: new Date() },
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
