import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceFingerprint, parseUserAgent } from "@/lib/security-notify";
import { recordServerError } from "@/lib/error-alert";

/**
 * واجهة الأجهزة المتصلة — صفحة الملف الشخصي:
 *  GET    — قائمة أجهزة الحساب (الجهاز الحالي أولًا دائمًا، ثم الأحدث نشاطًا) + بصمة الجهاز الحالي للتمييز الأخضر.
 *           كل استدعاء نبض حي: يوثّق جهاز هذا الطلب تلقائيًا إن لم يوجد (تحديث متصفح
 *           يغيّر البصمة) ويحدّث آخر نشاطه وآخر عنوانه — فلا يُقدَّم التاريخ قديمًا.
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
    const ua = h.get("user-agent");
    /* بصمة هذا الطلب هي الأصل الحي (تتبع المتصفح الفعلي الآن)، وبصمة الجلسة
       المختومة عند الولادة احتياط أول — يُفضّل عليها إن اختلفا لحظة التحديث */
    const requestDeviceHash = deviceFingerprint(userId, ua);
    const sessionDeviceHash = session.user.deviceHash ?? null;
    const currentDeviceHash = sessionDeviceHash ?? requestDeviceHash;

    /* نبض النشاط: سجّل جهاز هذا الطلب إن لم يوجد، وحدّث آخر نشاطه وآخر عنوانه.
       كل فتح للوحة وكل نبضة دورية (كل 5 دقائق في العميل) تمر من هنا */
    const uaInfo = parseUserAgent(ua);
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    try {
      await prisma.userDevice.upsert({
        where: { userId_deviceHash: { userId, deviceHash: requestDeviceHash } },
        create: {
          userId,
          deviceHash: requestDeviceHash,
          browser: uaInfo.browser,
          os: uaInfo.os,
          deviceType: uaInfo.deviceType,
          lastIp: ip,
          lastActiveAt: new Date(),
        },
        update: {
          browser: uaInfo.browser,
          os: uaInfo.os,
          deviceType: uaInfo.deviceType,
          lastIp: ip,
          lastActiveAt: new Date(),
        },
      });
    } catch {
      /* نبض فاشل لا يعطّل عرض القائمة أبدًا */
    }

    const rawDevices = await prisma.userDevice.findMany({
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

    /* وضع الجهاز الحالي في رأس القائمة دائمًا */
    const devices = [...rawDevices].sort((a, b) => {
      if (a.deviceHash === currentDeviceHash) return -1;
      if (b.deviceHash === currentDeviceHash) return 1;
      return 0;
    });

    return NextResponse.json({ devices, currentDeviceHash, sessionDeviceHash, requestDeviceHash });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/profile/devices",
      method: "GET",
      requestId: null,
    });
    return NextResponse.json({ devices: [], currentDeviceHash: null, sessionDeviceHash: null, requestDeviceHash: null });
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
