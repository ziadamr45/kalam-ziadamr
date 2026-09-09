import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { recordServerError } from "@/lib/error-alert";

/*
 * حذف الحساب الذاتي الفوري — وعد سياسة الخصوصية مُطبَّق حرفيًا:
 * «يمكنك حذف حسابك وكل ما يرتبط به من تعليقات وتفاعلات ومحفوظات فورًا وبنفسك».
 *
 * ما يُحذف فعليًا (داخل معاملة واحدة ذرّية):
 * - كل تعليقاته (وتُحذف بلاغاتها تلقائيًا بالـ Cascade)
 * - كل تفاعلاته (تصويتات)
 * - كل محفوظات مكتبته المتزامنة
 * - حسابه نفسه (وتُحذف روابط Google وجلساته بالـ Cascade)
 *
 * بعدها تُعاد صياغة صفحات المقالات التي ظهرت فيها تعليقاته حتى يختفي أثرها لحظةً.
 */

export async function DELETE() {
  try {
    const session = await auth();
    const uid = session?.user?.id;
    if (!uid) {
      return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
    }

    /* تأكد من وجود الحساب قبل التنفيذ */
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }

    /* مقالات تعليقاته المعتمدة لإعادة توليد صفحاتها بعد الحذف */
    const approved = await prisma.comment.findMany({
      where: { userId: uid, status: "APPROVED" },
      select: { article: { select: { slug: true } } },
    });

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { userId: uid } }),
      prisma.interaction.deleteMany({ where: { userId: uid } }),
      prisma.savedArticle.deleteMany({ where: { userId: uid } }),
      prisma.user.delete({ where: { id: uid } }),
    ]);

    /* سجل الشفافية: يصل لعلم الأدمن فورًا */
    logEvent({
      type: "ACCOUNT_SELF_DELETED",
      actorType: "USER",
      actorId: uid,
      actorLabel: session.user?.name ?? null,
      message: "حذف الحساب ذاتيًا مع كل بياناته (تعليقات + تفاعلات + محفوظات)",
      path: "/api/account/delete",
    });

    /* إعادة توليد الصفحات التي ظهرت فيها تعليقاته */
    const slugs = [...new Set(approved.map((c) => c.article.slug))];
    for (const slug of slugs) revalidatePath(`/article/${slug}`);
    revalidatePath("/profile");

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/account/delete", method: "DELETE", requestId: null, url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json(
      { error: "تعذر إتمام الحذف الآن — جرّب مرة أخرى أو تواصل معنا" },
      { status: 500 },
    );
  }
}
