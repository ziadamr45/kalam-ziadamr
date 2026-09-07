import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeComment } from "@/lib/moderation";
import { aiModerate } from "@/lib/ai-moderation";
import { pushAdmins } from "@/lib/push";

const rateBuckets = new Map<string, number[]>();

function allow(key: string): boolean {
  const now = Date.now();
  const window = 10 * 60_000;
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < window);
  if (arr.length >= 5) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "سجّل الدخول بحساب Google للمشاركة في الحوار" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { articleId?: string; content?: string; fp?: string };
    const { articleId, content, fp } = body;
    if (!articleId || !content?.trim()) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const rateKey = session.user.id;
    if (!allow(rateKey)) {
      return NextResponse.json(
        { error: "أرسلت عدة تعليقات خلال دقائق.. خذ نفسًا وعد لاحقًا" },
        { status: 429 },
      );
    }

    /* التحقق من حظر المستخدم */
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, name: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "تم إيقاف المشاركة لهذا الحساب" }, { status: 403 });
    }

    /* الفلترة الأخلاقية متعددة المستويات (قواعد محلية لحظية) */
    const verdict = analyzeComment(content);

    if (verdict.status === "REJECT") {
      return NextResponse.json({ error: verdict.reasons[0], rejected: true }, { status: 422 });
    }

    /* الرقابة الأخلاقية الفورية بالذكاء الاصطناعي — نداء خفيف قبل الحفظ،
       ومعاييره الصارمة: الألفاظ النابية، التجريح الشخصي، الشريعة والقيم الإسلامية،
       العادات والتقاليد العربية والمصرية الأصيلة، وحجب السبام.
       عند أي عطل تُهمل النتيجة وتكمل الفلترة المحلية ومراجعة التحرير عملهما. */
    const ai = await aiModerate(content);
    if (ai.checked && !ai.approved) {
      return NextResponse.json(
        {
          error: `${ai.reason} — راجع بنود صفحة «أخلاقيات الحوار والتعليق»`,
          rejected: true,
        },
        { status: 422 },
      );
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, title: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    await prisma.comment.create({
      data: {
        articleId,
        userId: session.user.id,
        content: content.trim(),
        status: "PENDING",
        flagged: verdict.flagged,
        flagReasons: verdict.reasons,
        riskScore: verdict.riskScore,
        guestFp: fp || null,
      },
    });

    /* إشعار ويب فوري لهاتف صاحب المنصة — تعليق جديد وارد يحتاج مراجعة */
    void pushAdmins({
      title: `تعليق جديد وارد على مقال: ${(article.title || "بدون عنوان").slice(0, 80)}`,
      body: `${session.user.name ?? "قارئ"}: ${content.trim().slice(0, 110)}${
        content.trim().length > 110 ? "…" : ""
      }`,
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/comments`,
      tag: "new-comment",
    });

    return NextResponse.json({ ok: true, message: "تعليقك وصل وسيظهر بعد مراجعة فريق التحرير" });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
