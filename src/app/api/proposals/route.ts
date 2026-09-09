import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rankForScore, canSendProposals } from "@/lib/ranks";
import { ELDERS_THRESHOLD } from "@/lib/impact";
import { getSiteConfigFresh } from "@/lib/site-config";
import { logEvent, getClientIp } from "@/lib/audit";
import { dispatchAdminEvent } from "@/lib/notifications/dispatcher";
import { userHasPrivilege } from "@/lib/vip";

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
    /* مفتاحا السيادة: إغلاق القناة كليًا + العتبة الحية من التكوين السيادي */
    const cfg = await getSiteConfigFresh().catch(() => null);
    const threshold = cfg?.IMPACT_ELDERS_THRESHOLD ?? ELDERS_THRESHOLD;
    if (cfg && !cfg.PROPOSALS_ENABLED) {
      return NextResponse.json(
        { error: "قناة المقترحات مغلقة مؤقتًا بإدارة المنصة" },
        { status: 403 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true, impactScore: true, customName: true, name: true },
    });
    if (!user || user.banned) {
      return NextResponse.json({ error: "المشاركة موقوفة لهذا الحساب" }, { status: 403 });
    }

    /* صلاحية ahlAlKalimaAccess تفتح القناة فورًا بغض النظر عن الرصيد */
    const channelPrivilege = await userHasPrivilege(session.user.id, "ahlAlKalimaAccess");

    /* بوابة الرصيد الحي — تُحتسب من الرصيد الفعلي المحدث لحظيًا (350 فأكثر)
       لا من نص رتبة مخزّن قد يتأخر — لا تجاوز برمجي ممكن */
    if (
      !channelPrivilege &&
      (!canSendProposals(rankForScore(user.impactScore)) || user.impactScore < threshold)
    ) {
      return NextResponse.json(
        {
          error: `قناة المقترحات الخاصة حصرية لـ«أهل الكلمة» (عتبة ${threshold} نقطة) — رصيدك الحالي ${user.impactScore}، تابع بناء أثرك`,
        },
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

    /* حدث سيادة: مقترح جديد في قناة أهل الكلمة — جرس اللوحة + بث فوري (بادج الأدمن) */
    void dispatchAdminEvent({
      type: "ADMIN_NEW_PROPOSAL",
      title: `مقترح فكري جديد ورد من عضو أهل الكلمة: ${user.customName || user.name || "قارئ"}`,
      message: `${title} — ${content.slice(0, 100)}${content.length > 100 ? "…" : ""}`,
      link: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/proposals`,
      pushTag: "user-proposal",
      metadata: { proposalId: proposal.id },
    });

    return NextResponse.json({ ok: true, id: proposal.id });
  } catch {
    return NextResponse.json({ error: "تعذر إرسال المقترح — أعد المحاولة" }, { status: 500 });
  }
}
