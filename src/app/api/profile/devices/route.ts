import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceFingerprint } from "@/lib/security-notify";
import { recordServerError } from "@/lib/error-alert";

/**
 * واجهة الأجهزة المتصلة — صفحة الملف الشخصي:
 *  GET    — قائمة أجهزة الحساب (الأحدث نشاطًا أولًا) + بصمة الجهاز الحالي للتمييز الأخضر
 *  DELETE — إبطال جلسة جهاز بعينه ({ deviceHash }): حذف سجله من قاعدة البيانات
 *           يجعل جلسة ذلك الجهاز ميتة فورًا (بوابة الـ session تقارن البصمة كل طلب).
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const userId = session.user.id;

    const h = await headers();
    const currentDeviceHash = deviceFingerprint(userId, h.get("user-agent"));

    const devices = await prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        deviceHash: true,
        browser: true,
        os: true,
        deviceType: true,
        lastIp: true,
        location: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ devices, currentDeviceHash });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/profile/devices",
      method: "GET",
      requestId: null,
    });
    return NextResponse.json({ devices: [], currentDeviceHash: null });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await request.json().catch(() => ({}))) as { deviceHash?: string };
    if (!body.deviceHash || typeof body.deviceHash !== "string") {
      return NextResponse.json({ error: "بصمة الجهاز مطلوبة" }, { status: 400 });
    }

    /* deleteMany بشرط الملكية — لا حذف لجهاز حساب آخر مهما بلغت المدخلات */
    const removed = await prisma.userDevice.deleteMany({
      where: { userId, deviceHash: body.deviceHash },
    });
    if (removed.count === 0) {
      return NextResponse.json({ error: "الجهاز غير موجود ضمن أجهزة حسابك" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      note: "أُبطلت جلسة الجهاز فورًا — سيجد الزائر نفسه غير مسجل عند أول تفاعل",
    });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/profile/devices",
      method: "DELETE",
      requestId: null,
    });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
