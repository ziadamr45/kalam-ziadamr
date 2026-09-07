import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent, getClientIp } from "@/lib/audit";
import { pushAdmins } from "@/lib/push";

/**
 * رسائل صفحة «اتصل بنا» — تُخزن في قاعدة البيانات
 * وتظهر مباشرة في لوحة تحكم الأدمن مع إشعار في السجل.
 */

const recentIps = new Map<string, number>();
const RATE_MS = 45_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      subject?: string;
      body?: string;
      honey?: string;
    };

    /* فخ السبام — إن امتلأ فهو بوت */
    if (body.honey) {
      return NextResponse.json({ ok: true });
    }

    const name = body.name?.trim() ?? "";
    const messageBody = body.body?.trim() ?? "";
    /* حقول الإجبار المعتمدة: الاسم + الرسالة (سطران فأكثر أو 50 حرفًا على الأقل)،
       والبريد الإلكتروني اختياري للرد فقط */
    const contentLines = messageBody.split("\n").filter((l) => l.trim().length > 0).length;
    if (name.length < 2 || (contentLines < 2 && messageBody.length < 50)) {
      return NextResponse.json(
        {
          error:
            "الاسم والرسالة حقلان إلزاميان، ويشترط أن تكون رسالتك أطول من سطر واحد؛ ليثمر حوارك نفعًا.",
        },
        { status: 400 },
      );
    }

    /* حد بسيط للإرسال من نفس الـ IP */
    const ip = getClientIp(request);
    const now = Date.now();
    const last = recentIps.get(ip ?? "?") ?? 0;
    if (now - last < RATE_MS) {
      return NextResponse.json(
        { error: "وصلتنا رسالتك للتو — انتظر لحظة قبل إرسال أخرى" },
        { status: 429 },
      );
    }

    const msg = await prisma.contactMessage.create({
      data: {
        name: name.slice(0, 80),
        email: body.email?.trim().slice(0, 120) || null,
        subject: body.subject?.trim().slice(0, 120) || null,
        body: messageBody.slice(0, 3000),
        ip,
        userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      },
    });
    recentIps.set(ip ?? "?", now);
    if (recentIps.size > 5000) recentIps.clear();

    /* إشعار ويب فوري لهاتف صاحب المنصة — اسم المرسل ومقتطف رسالته
       وتوضيح هل أرفق بريدًا للرد أم لا */
    void pushAdmins({
      title: `رسالة استفسار جديدة من: ${name.slice(0, 60)}`,
      body: `${messageBody.slice(0, 120)}${messageBody.length > 120 ? "…" : ""} — ${
        msg.email ? `البريد للرد: ${msg.email}` : "لم يُرفق بريد إلكتروني للرد"
      }`,
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/messages`,
      tag: "contact-message",
    });

    logEvent({
      type: "CONTACT_MESSAGE",
      actorType: "GUEST",
      actorLabel: name,
      message: body.subject?.trim() || "رسالة جديدة من اتصل بنا",
      meta: { messageId: msg.id },
      ip,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر إرسال الرسالة حاليًا" }, { status: 500 });
  }
}
