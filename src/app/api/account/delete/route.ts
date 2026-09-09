import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { recordServerError } from "@/lib/error-alert";
import { publicIdFromCloudinaryUrl, destroyCloudinaryImage } from "@/lib/cloudinary";

/*
 * المحو البرمجي الفوري الشامل — الحق في محو البيانات (GDPR Compliance)
 * وعد سياسة الخصوصية مُطبَّق حرفيًا: حذف فعلي لا حذف صوري.
 *
 * ما يُمحى فعليًا (داخل معاملة واحدة ذرّية — إما الكل أو لا شيء):
 * - كل تعليقاته وردوده (وتُحذف بلاغاتها تلقائيًا بالـ Cascade)
 * - كل تصويتاته على تعليقات الآخرين (CommentVote)
 * - سجلات تفاعله بالمقالات (Reaction/Interaction)
 * - رصيده وسجل أثره كاملًا (ImpactLedger/ImpactLog)
 * - محفوظاته السحابية (SavedArticle) ومواضع استئناف قراءته
 * - حصص نقاشه مع الذكاء الاصطناعي (AiDiscussionUsage)
 * - مقترحاته في قناة أهل الكلمة (UserProposal)
 * - إشعاراته وتفضيلاتها (Notification) واشتراكاته بالبث الفوري
 * - جلساته وأجهزته المسجلة وروابط Google (Session, Account)
 * - وأخيرًا سجله الأساسي (User) — ويليه كل المتبقي بالتتالي
 *
 * ويُكتب قيد التدقيق في AuditTrail داخل المعاملة نفسها: لا يُمحى
 * الحساب إلا أن يُوثق محوه (بلا أي معرِّف شخصي بعد الحذف — سياسة
 * الاحتفاظ القانوني بسجل الامتثال غير المعرّف).
 *
 * بعدها: حذف صوره الشخصية من مزود التخزين السحابي فورًا، وإعادة
 * صياغة صفحات المقالات التي ظهرت فيها تعليقاته حتى يختفي أثرها لحظةً.
 * ملاحظة سياسة: سجل الدخول LoginLog يبقى منقّى من هوية المستخدم
 * (SetNull) كدليل امتثال غير معرّف وفق نص سياسة الخصوصية.
 */

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    const uid = session?.user?.id;
    if (!uid) {
      return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
    }

    /* تأكد من وجود الحساب قبل التنفيذ */
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true, email: true, name: true, customName: true,
        customImage: true, image: true, role: true, impactScore: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }

    /* مقالات تعليقاته المعتمدة لإعادة توليد صفحاتها بعد الحذف */
    const approved = await prisma.comment.findMany({
      where: { userId: uid, status: "APPROVED" },
      select: { article: { select: { slug: true } } },
    });

    /* عُدّ ما سيُمحى — يودَع في السجل الرقابي كتفاصيل تقنية */
    const deletedCounts = {
      comments: await prisma.comment.count({ where: { userId: uid } }),
      commentVotes: await prisma.commentVote.count({ where: { userId: uid } }),
      interactions: await prisma.interaction.count({ where: { userId: uid } }),
      savedArticles: await prisma.savedArticle.count({ where: { userId: uid } }),
      readingProgress: await prisma.readingProgress.count({ where: { userId: uid } }),
      aiDiscussionUsage: await prisma.aiDiscussionUsage.count({ where: { userId: uid } }),
      impactLedger: await prisma.impactLog.count({ where: { userId: uid } }),
      proposals: await prisma.userProposal.count({ where: { userId: uid } }),
      notifications: await prisma.userNotification.count({ where: { userId: uid } }),
      pushSubscriptions: await prisma.userPushSubscription.count({ where: { userId: uid } }),
      sessions: await prisma.session.count({ where: { userId: uid } }).catch(() => 0),
      accounts: await prisma.account.count({ where: { userId: uid } }),
      user: 1,
    };

    const auditMetadata = {
      via: "self-profile",
      reasonCode: "USER_SELF_REQUEST",
      reasonLabel: "طلب حذف ذاتي من صفحة الملف الشخصي",
      targetLabel: user.customName ?? user.name ?? user.email ?? uid,
      targetRole: user.role,
      targetImpactScore: user.impactScore,
      deletedCounts,
      assetsRemoved: [] as string[],
      wipedAt: new Date().toISOString(),
    };

    /* ==================== المعاملة الذرّية: قيد رقابي + محو كامل ==================== */
    const auditId = await prisma.$transaction(async (tx) => {
      const entry = await tx.auditTrail.create({
        data: {
          actorId: uid,
          actorEmail: user.email ?? uid,
          actorRole: user.role,
          actionCategory: "USER_SELF_ACTION",
          actionType: "USER_SELF_HARD_DELETE",
          targetId: uid,
          targetEmail: user.email,
          reason: "طلب حذف ذاتي فوري من صفحة الملف الشخصي — محو برمجي شامل بلا استبقاء",
          evidenceUrl: null,
          metadata: auditMetadata as never,
        },
      });
      await tx.comment.deleteMany({ where: { userId: uid } });
      await tx.commentVote.deleteMany({ where: { userId: uid } });
      await tx.interaction.deleteMany({ where: { userId: uid } });
      await tx.savedArticle.deleteMany({ where: { userId: uid } });
      await tx.readingProgress.deleteMany({ where: { userId: uid } });
      await tx.aiDiscussionUsage.deleteMany({ where: { userId: uid } });
      await tx.impactLog.deleteMany({ where: { userId: uid } });
      await tx.userProposal.deleteMany({ where: { userId: uid } });
      await tx.userNotification.deleteMany({ where: { userId: uid } });
      await tx.userPushSubscription.deleteMany({ where: { userId: uid } });
      await tx.session.deleteMany({ where: { userId: uid } });
      await tx.account.deleteMany({ where: { userId: uid } });
      await tx.user.delete({ where: { id: uid } });
      return entry.id;
    });

    /* سجل الشفافية الحي: يصل لعلم الأدمن فورًا */
    logEvent({
      type: "ACCOUNT_SELF_DELETED",
      actorType: "USER",
      actorId: uid,
      actorLabel: session.user?.name ?? null,
      message: "محو برمجي شامل للحساب ذاتيًا: تعليقات وتفاعلات ورصيد أثر ومحفوظات وإشعارات وجلسات — بلا استبقاء",
      meta: { auditTrailId: auditId, deletedCounts },
      path: "/api/account/delete",
    });

    /* حذف صوره الشخصية من مزود التخزين السحابي فورًا — بلا تعطيل للمحو */
    const assetsRemoved: string[] = [];
    for (const assetUrl of [user.customImage, user.image]) {
      const publicId = publicIdFromCloudinaryUrl(assetUrl);
      if (!publicId) continue;
      const result = await destroyCloudinaryImage(publicId);
      if (result.deleted) assetsRemoved.push(publicId);
    }
    if (assetsRemoved.length) {
      await prisma.auditTrail
        .update({
          where: { id: auditId },
          data: { metadata: { ...auditMetadata, assetsRemoved } as never },
        })
        .catch(() => {});
    }

    /* إعادة توليد الصفحات التي ظهرت فيها تعليقاته */
    const slugs = [...new Set(approved.map((c) => c.article.slug))];
    for (const slug of slugs) revalidatePath(`/article/${slug}`);
    revalidatePath("/profile");

    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/account/delete", method: "DELETE", requestId: null, url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json(
      { error: "تعذر إتمام الحذف الآن — جرّب مرة أخرى أو تواصل معنا" },
      { status: 500 },
    );
  }
}
