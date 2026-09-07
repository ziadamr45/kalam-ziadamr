import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent, getClientIp } from "@/lib/audit";

/**
 * تحديث صورة الحساب — مُحرِّر الحساب الشخصي.
 * الصورة تُرفع أولًا عبر /api/upload ثم يُحدَّث هذا المسار برابطها.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { image?: string };
    const image = body.image?.trim();
    if (!image || !/^https:\/\//.test(image)) {
      return NextResponse.json({ error: "رابط صورة غير صالح" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: image.slice(0, 500) },
    });

    logEvent({
      type: "AVATAR_UPDATED",
      actorType: "USER",
      actorId: session.user.id,
      actorLabel: session.user.email ?? null,
      message: "حدّث المستخدم صورة حسابه",
      ip: getClientIp(request),
    }).catch(() => {});

    return NextResponse.json({ ok: true, image });
  } catch {
    return NextResponse.json({ error: "تعذر تحديث الصورة" }, { status: 500 });
  }
}
