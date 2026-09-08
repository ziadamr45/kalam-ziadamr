import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSendProposals } from "@/lib/ranks";
import { logEvent, getClientIp } from "@/lib/audit";
import { pushAdmins } from "@/lib/push";

/**
 * ============================================================
 * قناة «أهل الكلمة» — مقترحات فكرية خاصة تصل للأدمن مباشرة
 * ============================================================
 * ميزة حصرية لأصحاب أعلى رتبة فكرية (350 نقطة أثر فأكثر):
 * نموذج مخصص في صفحتهم الشخصية يرسل موضوعات ومقترحات فكرية
 * تُوثَّق في قاعدة البيانات وتُبث فورًا لهاتف صاحب المنصة.
 */

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, intellectualRank: true, customName: true, name: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "المشاركة موقوفة لهذا الحساب" }, { status: 403 });
    }

    /* بوابة الرتبة — حصرية لأهل الكلمة */
    if (!canSendProposals(user.intellectualRank)) {
      return NextResponse.json(
        { error: "قناة المقترحات الخاصة مفعّلة لرتبة «أهل الكلمة» — تابع بناء رصيد أثرك" },
        { status: 403 },
      );
    }

    /* مانع اندفاع: مقترح كل 10 دقائق كحد أقصى */
    const last = await prisma.userProposal.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < 10 * 60_000) {
      return NextResponse.json(
        { error: "أرسلت مقترحًا منذ قليل — دع الأفكار تنضج ثم أرسل ما يليها" },
        { status: 429 },
      );
    }

    const body = (await request.json()) as { title?: string; content?: string };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    if (title.length < 5 || title.length > 120) {
      return NextResponse.json({ error: "عنوان المقترح بين 5 و120 حرفًا" }, { status: 400 });
    }
    if (content.length < 50 || content.length > 4000) {
      return NextResponse.json({ error: "تفصيل المقترح بين 50 و4000 حرف" }, { status: 400 });
    }

    const proposal = await prisma.userProposal.create({
      data: { userId: session.user.id, title, content },
    });

    logEvent({
      type: "PROPOSAL_SENT",
      actorType: "USER",
      actorId: session.user.id,
      actorLabel: session.user.email ?? null,
      message: `مقترح من «أهل الكلمة»: ${title}`,
      ip: getClientIp(request),
    }).catch(() => {});

    /* المقترحات الفكرية تستحق وصولاً فوريًا لهاتف صاحب المنصة */
    void pushAdmins({
      title: `مقترح فكري من ${user.customName || user.name || "قارئ"} (أهل الكلمة)`,
      body: `${title} — ${content.slice(0, 100)}${content.length > 100 ? "…" : ""}`,
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/proposals`,
      tag: "user-proposal",
    });

    return NextResponse.json({ ok: true, id: proposal.id });
  } catch {
    return NextResponse.json({ error: "تعذر إرسال المقترح — أعد المحاولة" }, { status: 500 });
  }
}
