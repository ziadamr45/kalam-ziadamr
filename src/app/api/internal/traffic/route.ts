import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromUserAgent } from "@/lib/traffic";

/**
 * نقطة استقبال سجل الحركة الداخلي للمنصة العامة — يستدعيها middleware
 * (عبر after) بعد انتهاء الاستجابة. الكتابة هنا في Node عبر Prisma،
 * والربط بهوية القارئ يُستكمل لينًا من كوكي جلسة Auth.js.
 */

export const runtime = "nodejs";

type Entry = {
  requestId: string;
  app?: string;
  method: string;
  path: string;
  status?: number | null;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
  cookie?: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = request.headers.get("x-traffic-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const entry = (await request.json()) as Entry;
    if (!entry?.requestId || !entry?.path) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const device = deviceFromUserAgent(entry.userAgent ?? "");

    await prisma.requestLog.upsert({
      where: { requestId: entry.requestId },
      update: {
        status: entry.status ?? undefined,
        durationMs: entry.durationMs ?? undefined,
      },
      create: {
        requestId: entry.requestId,
        app: "PUBLIC",
        method: entry.method.slice(0, 8),
        path: entry.path.slice(0, 300),
        status: entry.status ?? null,
        durationMs: entry.durationMs ?? null,
        ip: entry.ip ?? null,
        device,
        userAgent: entry.userAgent ?? null,
        country: entry.country ?? null,
        isError: false,
      },
    });

    /* الربط اللين بهوية القارئ — خارج المسار الحرج */
    if (device !== "bot" && entry.cookie) {
      void linkReader(entry.requestId, entry.cookie).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/** استخراج هوية القارئ من كوكي جلسة Auth.js (JWT مشفّر) ثم ربطها بالسجل */
async function linkReader(requestId: string, cookie: string): Promise<void> {
  try {
    const match =
      cookie.match(/authjs\.session-token=([^;]+)/) ??
      cookie.match(/next-auth\.session-token=([^;]+)/);
    if (!match) return;
    const token = decodeURIComponent(match[1]);
    if (token.length < 20) return;

    const { getToken } = await import("next-auth/jwt");
    const payload = (await getToken({
      req: { cookies: { "authjs.session-token": token, "next-auth.session-token": token } } as never,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      salt: "authjs.session-token",
    })) as { uid?: unknown; id?: unknown; sub?: string } | null;
    const uidRaw = payload?.uid ?? payload?.id ?? payload?.sub;
    const userId = uidRaw ? String(uidRaw) : null;
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    await prisma.requestLog.update({
      where: { requestId },
      data: { userId, userEmail: user?.email ?? null },
    });
  } catch {
    /* الربط اللين — أي عجز يُهمل بصمت */
  }
}
