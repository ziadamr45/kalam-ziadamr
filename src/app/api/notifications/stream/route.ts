import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * بث الإشعارات اللحظي عبر Server-Sent Events (SSE):
 * نبض كل 15 ثانية يقرأ عدّاد غير المقروء وآخر إشعار — وعند تغيّرهما
 * يُدفع حدث لحظي للواجهة لتحديث عداد الجرس وإطلاق التوست بلا إعادة تحميل.
 *
 * قيود بيئة الخادم اللامركزي: يُغلق النفق ذاتيًا بعد 50 ثانية،
 * وEventSource في المتصفح يعيد الاتصال تلقائيًا — دورة حياة متجددة آمنة.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICK_MS = 15_000;
const LIFETIME_MS = 50_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastUnread = -1;
      let lastId: string | null = null;

      const send = (data: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const stop = (): void => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          /* أُغلق مسبقًا */
        }
      };

      const tick = async (): Promise<void> => {
        try {
          const [unread, latest] = await Promise.all([
            prisma.notification.count({ where: { userId, isRead: false } }),
            prisma.notification.findFirst({
              where: { userId },
              orderBy: { createdAt: "desc" },
              select: { id: true, title: true, message: true, link: true, type: true },
            }),
          ]);
          const changed = unread !== lastUnread || (latest && latest.id !== lastId);
          if (changed) {
            const isNewItem = Boolean(latest && latest.id !== lastId && unread > lastUnread);
            lastUnread = unread;
            lastId = latest?.id ?? null;
            send({ unread, isNewItem, latest: isNewItem ? latest : undefined });
          } else {
            send({ heartbeat: true, unread });
          }
        } catch {
          send({ heartbeat: true });
        }
      };

      await tick();
      interval = setInterval(tick, TICK_MS);
      timeout = setTimeout(stop, LIFETIME_MS);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
